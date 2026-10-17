import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createConversationRepository, preview, PREVIEW_LENGTH } from './conversations.js';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  RequestDataError,
  type IncrementRequestRepository,
} from './increment-requests.js';
import type { NewNotification } from './notifications.js';
import { createReviewRepository } from './review.js';
import type { Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL, TEST_OWNER_URL, testCipher } from './test-support/db.js';

// Questions and answers per employee (R1-08) against a real database: posting both ways,
// encryption at rest, who has to answer, append-only, and isolation (RLS).
const [SUB_A, SUB_B] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const alpha: Scope = { userId: SEED_ASSIGNMENTS[0].userId, kind: 'entity', entityIds: [SUB_A.id] };
const beta: Scope = { userId: SEED_ASSIGNMENTS[1].userId, kind: 'entity', entityIds: [SUB_B.id] };
const reviewer: Scope = { userId: 'sirius-reviewer', kind: 'group' };

let handle: DatabaseHandle;
let requests: IncrementRequestRepository;
let conversations: ReturnType<typeof createConversationRepository>;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
let employees: string[] = [];

async function asOwner<T extends pg.QueryResultRow>(
  statement: string,
  values: unknown[] = [],
  userId = '',
) {
  await owner.query('BEGIN');
  try {
    await owner.query("SELECT set_config('app.scope', 'group', true)");
    // Notifications are readable by their recipient only (RLS), the owner included.
    await owner.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await owner.query<T>(statement, values);
    await owner.query('COMMIT');
    return result.rows;
  } catch (error: unknown) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

async function refusal(promise: Promise<unknown>): Promise<RequestDataError> {
  const error: unknown = await promise.then(
    () => new Error('expected a refusal'),
    (reason: unknown) => reason,
  );
  if (!(error instanceof RequestDataError)) throw error;
  return error;
}

/** A draft of Subsidiary A with two employees, optionally submitted. */
async function request(submit = true) {
  const { id } = await requests.create(alpha, {
    entityId: SUB_A.id,
    cycleId: CYCLE,
    employeeIds: employees,
    idempotencyKey: `key-${randomUUID()}`,
  });
  const draft = await requests.get(alpha, id);
  const lines = (draft?.lines ?? []).map((line) => line.id);
  if (submit) {
    await requests.saveDraft(alpha, id, {
      version: 1,
      proposals: lines.map((lineId) => ({ lineId, kind: 'percent' as const, value: '5.00' })),
    });
    await requests.submit(alpha, id, {
      version: 2,
      idempotencyKey: `key-${randomUUID()}`,
      submitterName: 'Alpha HR Test',
      notifications: () => [],
    });
  }
  return { id, lines };
}

const toSubsidiary = (context: {
  submittedBy: string | null;
  entityId: string;
  requestId: string;
  lineId: string;
  employeeName: string;
}): NewNotification[] => [
  {
    recipient: { userId: context.submittedBy ?? 'nobody' },
    kind: 'question_asked',
    entityId: context.entityId,
    requestId: context.requestId,
    params: { employee: context.employeeName, lineId: context.lineId },
    actionNeeded: true,
  },
];

function post(
  scope: Scope,
  requestId: string,
  lineId: string,
  body: string,
  side: 'sirius' | 'subsidiary' = scope.kind === 'group' ? 'sirius' : 'subsidiary',
  idempotencyKey = `key-${randomUUID()}`,
) {
  return conversations.post(scope, {
    requestId,
    lineId,
    side,
    authorName: side === 'sirius' ? 'Sara Al Mansoori' : 'Alpha HR Test',
    body,
    idempotencyKey,
    notifications: side === 'sirius' ? toSubsidiary : () => [],
  });
}

beforeAll(async () => {
  await resetCoreDatabase();
  await owner.connect();
  const rows = await asOwner<{ id: string }>(
    "SELECT id FROM core.employee WHERE employee_number IN ('EMP-1101', 'EMP-1102') ORDER BY employee_number",
  );
  employees = rows.map((row) => row.id);
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 4 });
  requests = createIncrementRequestRepository(handle.db, testCipher);
  conversations = createConversationRepository(handle.db, testCipher);
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('preview', () => {
  it('flattens whitespace and cuts long text at a whole character', () => {
    expect(preview('  Line one\n\nline   two ')).toBe('Line one line two');
    const long = 'أ'.repeat(PREVIEW_LENGTH + 10);
    expect(preview(long)).toHaveLength(PREVIEW_LENGTH);
    expect(preview(long).endsWith('…')).toBe(true);
    expect(preview('x'.repeat(PREVIEW_LENGTH))).toBe('x'.repeat(PREVIEW_LENGTH));
  });
});

describe('conversations [R1-08]', () => {
  it('records questions and answers both ways, encrypted, with who has to answer', async () => {
    const { id, lines } = await request();
    const [aisha, yusuf] = lines.map(String);
    await post(reviewer, id, String(aisha), 'Is the 2026 appraisal signed?');
    await post(alpha, id, String(aisha), 'Yes — signed copy attached to C1.');
    await post(reviewer, id, String(yusuf), 'Why 5% for a G6?');
    expect(await conversations.thread(alpha, id, String(aisha))).toMatchObject([
      { side: 'sirius', authorName: 'Sara Al Mansoori', body: 'Is the 2026 appraisal signed?' },
      {
        side: 'subsidiary',
        authorName: 'Alpha HR Test',
        body: 'Yes — signed copy attached to C1.',
      },
    ]);
    // Encrypted at rest; the trail says something was asked, never what.
    const [stored] = await asOwner<{ body: Buffer }>(
      'SELECT body FROM increments.line_message WHERE line_id = $1 ORDER BY created_at LIMIT 1',
      [aisha],
    );
    expect(stored?.body.toString('utf8')).not.toContain('appraisal');
    const audit = await asOwner<{ details: Record<string, unknown> }>(
      "SELECT details FROM audit.audit_log WHERE action = 'message.posted' AND subject_id = $1",
      [aisha],
    );
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toContain('appraisal');
    // The subsidiary has one to answer (Yusuf); Sirius HR has one answer to read (Aisha).
    const forSubsidiary = await conversations.threads(alpha, {
      side: 'subsidiary',
      filter: 'awaiting',
      limit: 10,
      offset: 0,
    });
    expect(forSubsidiary.items.map((item) => item.fullName)).toEqual(['Yusuf Karim']);
    expect(forSubsidiary.counts).toEqual({ all: 2, awaiting: 1 });
    expect(forSubsidiary.total).toBe(1);
    const all = await conversations.threads(reviewer, {
      side: 'sirius',
      filter: 'all',
      limit: 10,
      offset: 0,
    });
    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(all.items.find((item) => item.lineId === aisha)).toMatchObject({
      request: { id, entityCode: 'SUB-A' },
      employeeNumber: 'EMP-1101',
      messages: 2,
      last: { side: 'subsidiary', preview: 'Yes — signed copy attached to C1.' },
    });
    // The subsidiary is told about Sirius HR's questions, with action needed.
    const notices = await asOwner<{ kind: string; action_needed: boolean }>(
      'SELECT kind, action_needed FROM notify.notification WHERE request_id = $1 ORDER BY created_at',
      [id],
      alpha.userId,
    );
    expect(notices).toEqual([
      { kind: 'question_asked', action_needed: true },
      { kind: 'question_asked', action_needed: true },
    ]);
    // Append-only.
    await expect(
      asOwner('DELETE FROM increments.line_message WHERE request_id = $1', [id]),
    ).rejects.toThrow(/append-only/u);
  });

  it('replays a repeated key, and refuses drafts, decided requests and unknown employees', async () => {
    const { id, lines } = await request();
    const key = `key-${randomUUID()}`;
    await post(reviewer, id, String(lines[0]), 'First?', 'sirius', key);
    await expect(post(reviewer, id, String(lines[0]), 'First?', 'sirius', key)).resolves.toEqual({
      replayed: true,
    });
    expect(await conversations.thread(reviewer, id, String(lines[0]))).toHaveLength(1);
    await expect(refusal(post(reviewer, id, randomUUID(), 'x'))).resolves.toMatchObject({
      reason: 'line_not_found',
    });
    await expect(
      refusal(post(reviewer, randomUUID(), String(lines[0]), 'x')),
    ).resolves.toMatchObject({ reason: 'not_found' });
    const draft = await request(false);
    await expect(
      refusal(post(alpha, draft.id, String(draft.lines[0]), 'x')),
    ).resolves.toMatchObject({ reason: 'not_in_review' });
    // Decided: every employee rejected, the request is final.
    const review = createReviewRepository(handle.db, testCipher);
    for (const lineId of lines) {
      await review.decide(reviewer, {
        requestId: id,
        lineId,
        idempotencyKey: `key-${randomUUID()}`,
        decision: 'rejected',
        reasonCode: 'budget',
        comment: 'Over budget.',
        approved: null,
        actorName: 'Sara',
        notifications: () => [],
      });
    }
    await expect(refusal(post(alpha, id, String(lines[0]), 'But…'))).resolves.toMatchObject({
      reason: 'not_in_review',
    });
  });

  it('keeps every conversation within its subsidiary', async () => {
    const { id, lines } = await request();
    await post(reviewer, id, String(lines[0]), 'Private question.');
    expect(await conversations.thread(beta, id, String(lines[0]))).toEqual([]);
    const theirs = await conversations.threads(beta, {
      side: 'subsidiary',
      filter: 'all',
      limit: 10,
      offset: 0,
    });
    expect(theirs).toEqual({ items: [], total: 0, counts: { all: 0, awaiting: 0 } });
    await expect(refusal(post(beta, id, String(lines[0]), 'x'))).resolves.toMatchObject({
      reason: 'not_found',
    });
  });
});
