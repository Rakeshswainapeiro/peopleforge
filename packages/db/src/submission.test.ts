import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  RequestDataError,
  type IncrementRequestRepository,
} from './increment-requests.js';
import {
  createNotificationRepository,
  type NewNotification,
  type NotificationRepository,
} from './notifications.js';
import { withScope, type Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL, TEST_OWNER_URL, testCipher } from './test-support/db.js';

// Submission (R1-07), status history, the append-only audit trail (R1-15) and notifications
// (R1-07, R1-13) against a real database: transactions, Row-Level Security, grants, triggers.
const [SUB_A, SUB_B] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const REVIEWER_ROLE = 'PeopleForge.Reviewer';
const alpha: Scope = { userId: SEED_ASSIGNMENTS[0].userId, kind: 'entity', entityIds: [SUB_A.id] };
const beta: Scope = { userId: SEED_ASSIGNMENTS[1].userId, kind: 'entity', entityIds: [SUB_B.id] };
const reviewer: Scope = { userId: 'sirius-reviewer', kind: 'group' };
const executive: Scope = { userId: 'sirius-exec', kind: 'group' };

let handle: DatabaseHandle;
let repo: IncrementRequestRepository;
let notifications: NotificationRepository;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
let employee = '';

async function asOwner<T extends pg.QueryResultRow>(
  statement: string,
  values: unknown[] = [],
  userId = '',
) {
  await owner.query('BEGIN');
  try {
    await owner.query(
      "SELECT set_config('app.scope', 'group', true), set_config('app.user_id', $1, true)",
      [userId],
    );
    const result = await owner.query<T>(statement, values);
    await owner.query('COMMIT');
    return result.rows;
  } catch (error: unknown) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

async function draft(scope: Scope = alpha, entityId: string = SUB_A.id): Promise<string> {
  const { id } = await repo.create(scope, {
    entityId,
    cycleId: CYCLE,
    employeeIds: [employee],
    idempotencyKey: `key-${randomUUID()}`,
  });
  return id;
}

const announce =
  (requestId: string) =>
  (reference: string): NewNotification[] => [
    {
      recipient: { userId: alpha.userId },
      kind: 'request_submitted',
      entityId: SUB_A.id,
      requestId,
      params: { reference, employees: 1 },
    },
    {
      recipient: { role: REVIEWER_ROLE },
      kind: 'request_received',
      entityId: SUB_A.id,
      requestId,
      params: { reference, entity: 'SUB-A' },
      actionNeeded: true,
    },
  ];

async function submit(id: string, version = 1, key = `key-${randomUUID()}`) {
  return repo.submit(alpha, id, { version, idempotencyKey: key, notifications: announce(id) });
}

async function refusal(promise: Promise<unknown>): Promise<RequestDataError> {
  const error: unknown = await promise.then(
    () => new Error('expected a refusal'),
    (reason: unknown) => reason,
  );
  if (!(error instanceof RequestDataError)) throw error;
  return error;
}

beforeAll(async () => {
  await resetCoreDatabase();
  await owner.connect();
  const [row] = await asOwner<{ id: string }>(
    "SELECT id FROM core.employee WHERE employee_number = 'EMP-1101'",
  );
  employee = String(row?.id);
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 4 });
  repo = createIncrementRequestRepository(handle.db, testCipher);
  notifications = createNotificationRepository(handle.db);
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('submit [R1-07]', () => {
  it('submits a draft: status, history, audit and notifications in one go', async () => {
    const id = await draft();
    await expect(submit(id)).resolves.toEqual({ replayed: false });
    const request = await repo.get(alpha, id);
    expect(request).toMatchObject({ status: 'submitted', version: 2 });
    expect(request?.submittedAt).toBeInstanceOf(Date);
    expect(request?.cycle.submissionDeadline).toBe('2026-11-30');

    const events = await asOwner(
      'SELECT from_status, to_status, actor FROM increments.status_event WHERE request_id = $1',
      [id],
    );
    expect(events).toEqual([{ from_status: 'draft', to_status: 'submitted', actor: alpha.userId }]);
    const audit = await asOwner<{ action: string }>(
      'SELECT action FROM audit.audit_log WHERE subject_id = $1 ORDER BY id',
      [id],
    );
    expect(audit.map((row) => row.action)).toEqual([
      'increment_request.created',
      'increment_request.submitted',
    ]);
    const queued = await asOwner<{ n: string }>(
      `SELECT count(*) AS n FROM notify.email_outbox o
         JOIN notify.notification n ON n.id = o.notification_id WHERE n.request_id = $1`,
      [id],
      // RLS binds the owner too: read as the submitter, who sees their own and (group scope)
      // the role-addressed notification.
      alpha.userId,
    );
    expect(queued).toEqual([{ n: '2' }]);
  });

  it('treats a repeated key as a replay and refuses a key used for another request', async () => {
    const id = await draft();
    const key = `key-${randomUUID()}`;
    await submit(id, 1, key);
    await expect(submit(id, 1, key)).resolves.toEqual({ replayed: true });
    const other = await draft();
    expect(await refusal(submit(other, 1, key))).toMatchObject({
      reason: 'idempotency_conflict',
    });
  });

  it('refuses a stale version, an unknown request and another subsidiary’s draft', async () => {
    const id = await draft();
    expect(await refusal(submit(id, 7))).toMatchObject({ reason: 'version_conflict' });
    expect(await refusal(submit(randomUUID()))).toMatchObject({ reason: 'not_found' });
    expect(
      await refusal(
        repo.submit(beta, id, {
          version: 1,
          idempotencyKey: `key-${randomUUID()}`,
          notifications: () => [],
        }),
      ),
    ).toMatchObject({ reason: 'not_found' });
    expect((await repo.get(alpha, id))?.status).toBe('draft');
  });

  it('freezes a submitted request: every change is refused', async () => {
    const id = await draft();
    await submit(id);
    const request = await repo.get(alpha, id);
    const lineId = String(request?.lines[0]?.id);
    const criterionId = String(request?.criteria[0]?.id);
    const attempts: (() => Promise<unknown>)[] = [
      () => repo.saveDraft(alpha, id, { version: 2, proposals: [] }),
      () => repo.addLine(alpha, id, employee),
      () => repo.removeLine(alpha, id, lineId),
      () => repo.removeEvidence(alpha, id, randomUUID()),
      () =>
        repo.addEvidence(alpha, id, {
          id: randomUUID(),
          lineId,
          criterionId,
          objectKey: `evidence/${SUB_A.id}/${randomUUID()}`,
          fileName: 'a.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 1,
          sha256: 'a'.repeat(64),
          scanEngine: 'clamav',
          scannedAt: new Date(),
        }),
      () => submit(id, 2),
    ];
    for (const attempt of attempts) {
      expect(await refusal(attempt())).toMatchObject({ reason: 'not_draft' });
    }
  });

  it('shows submitted requests to Sirius, drafts still not', async () => {
    const submitted = await draft();
    await submit(submitted);
    const stillDraft = await draft();
    const page = await repo.list(reviewer, { includeDrafts: false, limit: 200, offset: 0 });
    const ids = page.items.map((item) => item.id);
    expect(ids).toContain(submitted);
    expect(ids).not.toContain(stillDraft);
  });
});

describe('status history and audit trail are append-only [R1-15, NFR-AUD-01]', () => {
  it('refuses UPDATE and DELETE even for the owner', async () => {
    const id = await draft();
    await submit(id);
    for (const statement of [
      'UPDATE audit.audit_log SET actor = $1 WHERE subject_id = $2',
      'DELETE FROM audit.audit_log WHERE subject_id = $2 AND actor = $1',
      'UPDATE increments.status_event SET actor = $1 WHERE request_id = $2',
      'DELETE FROM increments.status_event WHERE request_id = $2 AND actor = $1',
    ]) {
      await expect(asOwner(statement, ['tampered', id])).rejects.toThrow(/append-only/);
    }
  });

  it('gives the app role no UPDATE or DELETE either', async () => {
    await expect(
      withScope(handle.db, reviewer, (trx) => trx.deleteFrom('audit.audit_log').execute()),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withScope(handle.db, reviewer, (trx) =>
        trx.updateTable('increments.status_event').set({ actor: 'x' }).execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('lets people record only their own actions, in their own scope, and only Sirius read', async () => {
    await repo.recordAction(alpha, {
      action: 'evidence.downloaded',
      entityId: SUB_A.id,
      subjectType: 'evidence_file',
      subjectId: 'f-1',
    });
    await expect(
      withScope(handle.db, alpha, (trx) =>
        trx
          .insertInto('audit.audit_log')
          .values({
            actor: 'someone-else',
            action: 'x.y',
            entity_id: null,
            subject_type: 'x',
            subject_id: 'y',
            details: '{}',
            correlation_id: null,
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      repo.recordAction(alpha, {
        action: 'evidence.downloaded',
        entityId: SUB_B.id,
        subjectType: 'evidence_file',
        subjectId: 'f-2',
      }),
    ).rejects.toThrow(/row-level security/);
    const seenByAlpha = await withScope(handle.db, alpha, (trx) =>
      trx.selectFrom('audit.audit_log').select('id').execute(),
    );
    expect(seenByAlpha).toEqual([]);
    const seenBySirius = await withScope(handle.db, reviewer, (trx) =>
      trx
        .selectFrom('audit.audit_log')
        .select(['action', 'details'])
        .where('subject_id', '=', 'f-1')
        .execute(),
    );
    expect(seenBySirius).toEqual([{ action: 'evidence.downloaded', details: {} }]);
  });

  it('keeps status history inside the subsidiary', async () => {
    const id = await draft();
    await submit(id);
    const seen = await withScope(handle.db, beta, (trx) =>
      trx.selectFrom('increments.status_event').select('id').where('request_id', '=', id).execute(),
    );
    expect(seen).toEqual([]);
  });
});

describe('notifications [R1-07, R1-13]', () => {
  it('reach the submitter, and Sirius users through their role', async () => {
    const id = await draft();
    await submit(id);
    const own = await notifications.list(alpha, {
      roles: ['PeopleForge.SubsidiaryHR'],
      filter: 'all',
      limit: 50,
      offset: 0,
    });
    const mine = own.items.find((item) => item.requestId === id);
    expect(mine).toMatchObject({ kind: 'request_submitted', read: false, actionNeeded: false });
    expect(mine?.params).toMatchObject({ employees: 1 });

    const forReviewer = await notifications.list(reviewer, {
      roles: [REVIEWER_ROLE],
      filter: 'action_needed',
      limit: 50,
      offset: 0,
    });
    expect(forReviewer.items.find((item) => item.requestId === id)).toMatchObject({
      kind: 'request_received',
      actionNeeded: true,
    });
    // An executive (another role) doesn't get the reviewers' notifications.
    const forExecutive = await notifications.list(executive, {
      roles: ['PeopleForge.Executive'],
      filter: 'all',
      limit: 50,
      offset: 0,
    });
    expect(forExecutive.items.some((item) => item.requestId === id)).toBe(false);
  });

  it('never shows role-addressed or other people’s notifications to a subsidiary', async () => {
    const id = await draft();
    await submit(id);
    const claimingRole = await notifications.list(alpha, {
      roles: [REVIEWER_ROLE],
      filter: 'all',
      limit: 50,
      offset: 0,
    });
    expect(claimingRole.items.some((item) => item.kind === 'request_received')).toBe(false);
    const other = await notifications.list(beta, {
      roles: ['PeopleForge.SubsidiaryHR'],
      filter: 'all',
      limit: 50,
      offset: 0,
    });
    expect(other.items.some((item) => item.requestId === id)).toBe(false);
  });

  it('counts unread, filters, pages and marks read per user', async () => {
    const reader: Scope = { userId: `reader-${randomUUID()}`, kind: 'group' };
    const ids = [await draft(), await draft(), await draft()];
    for (const id of ids) await submit(id);
    const query = { roles: [REVIEWER_ROLE], limit: 2, offset: 0 } as const;
    const before = await notifications.list(reader, { ...query, filter: 'unread' });
    expect(before.unread).toBeGreaterThanOrEqual(3);
    expect(before.items).toHaveLength(2);
    expect(before.total).toBe(before.unread);

    const [first] = before.items;
    await notifications.markRead(reader, { roles: query.roles, ids: [String(first?.id)] });
    await notifications.markRead(reader, { roles: query.roles, ids: [String(first?.id)] });
    await notifications.markRead(reader, { roles: query.roles, ids: [] });
    const after = await notifications.list(reader, { ...query, filter: 'all' });
    expect(after.unread).toBe(before.unread - 1);
    expect(after.items.find((item) => item.id === first?.id)?.read).toBe(true);

    await notifications.markRead(reader, { roles: query.roles });
    await notifications.markRead(reader, { roles: query.roles });
    const done = await notifications.list(reader, { ...query, filter: 'unread' });
    expect(done).toMatchObject({ unread: 0, total: 0, items: [] });
    // Another reviewer's read state is their own.
    const colleague = await notifications.list(reviewer, { ...query, filter: 'unread' });
    expect(colleague.unread).toBeGreaterThan(0);
  });

  it('lists nothing role-addressed for a caller without roles', async () => {
    const page = await notifications.list(
      { userId: `nobody-${randomUUID()}`, kind: 'group' },
      { roles: [], filter: 'all', limit: 10, offset: 0 },
    );
    expect(page).toEqual({ items: [], total: 0, unread: 0 });
  });

  it('refuses a notification about another subsidiary, and reading the email queue', async () => {
    await expect(
      withScope(handle.db, alpha, (trx) =>
        trx
          .insertInto('notify.notification')
          .values({
            recipient_user_id: alpha.userId,
            recipient_role: null,
            entity_id: SUB_B.id,
            request_id: null,
            kind: 'x',
            params: '{}',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withScope(handle.db, reviewer, (trx) =>
        trx.selectFrom('notify.email_outbox').select('id').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
