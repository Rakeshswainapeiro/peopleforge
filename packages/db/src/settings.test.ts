import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  type IncrementRequestRepository,
} from './increment-requests.js';
import { createReviewRepository } from './review.js';
import type { Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import {
  createSettingsRepository,
  queueReminders,
  SettingsDataError,
  type CriterionEdit,
  type ReminderKind,
} from './settings.js';
import {
  resetCoreDatabase,
  TEST_APP_URL,
  TEST_OWNER_URL,
  TEST_WORKER_URL,
  testCipher,
} from './test-support/db.js';

// Settings (R1-05, NFR-CFG-01) and reminders on configured triggers (R1-13) against a real
// database: versioned criteria, audited rule changes, each reminder once, and a worker role
// that may queue reminders without reading a single request.
const [SUB_A] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const REVIEWER_ROLE = 'PeopleForge.Reviewer';
const alpha: Scope = {
  userId: SEED_ASSIGNMENTS[0].userId,
  userName: 'Alpha HR Test',
  kind: 'entity',
  entityIds: [SUB_A.id],
};
const admin: Scope = { userId: 'admin-1', userName: 'Admin Test', kind: 'group' };
const reviewer: Scope = { userId: 'sirius-reviewer', kind: 'group' };

let handle: DatabaseHandle;
let worker: DatabaseHandle;
let requests: IncrementRequestRepository;
let settings: ReturnType<typeof createSettingsRepository>;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
let employees: string[] = [];

/** As the database owner in group scope (to set up times and read what was written). */
async function asOwner<T extends pg.QueryResultRow>(
  statement: string,
  values: unknown[] = [],
  userId = 'test-owner',
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

async function refusal(promise: Promise<unknown>): Promise<SettingsDataError> {
  const error: unknown = await promise.then(
    () => new Error('expected a refusal'),
    (reason: unknown) => reason,
  );
  if (!(error instanceof SettingsDataError)) throw error;
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

const reminders = (requestId: string, userId?: string) =>
  asOwner<{
    kind: string;
    recipient_user_id: string | null;
    recipient_role: string | null;
    params: Record<string, string | number>;
    action_needed: boolean;
    emails: number;
  }>(
    `SELECT n.kind, n.recipient_user_id, n.recipient_role, n.params, n.action_needed,
            (SELECT count(*)::int FROM notify.email_outbox o WHERE o.notification_id = n.id) AS emails
       FROM notify.notification n
      WHERE n.request_id = $1 AND n.kind IN ('review_overdue', 'return_overdue', 'deadline_approaching')
      ORDER BY n.created_at`,
    [requestId],
    userId,
  );

beforeAll(async () => {
  await resetCoreDatabase();
  await owner.connect();
  const rows = await asOwner<{ id: string }>(
    "SELECT id FROM core.employee WHERE employee_number IN ('EMP-1101', 'EMP-1102') ORDER BY employee_number",
  );
  employees = rows.map((row) => row.id);
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 4 });
  worker = createDatabase({ connectionString: TEST_WORKER_URL, poolMax: 2 });
  requests = createIncrementRequestRepository(handle.db, testCipher);
  settings = createSettingsRepository(handle.db);
});

afterAll(async () => {
  await handle.close();
  await worker.close();
  await owner.end();
});

describe('reminder rules [R1-13, NFR-CFG-01]', () => {
  it('lists the defaults in screen order and records who changed one', async () => {
    expect(await settings.reminderRules(admin)).toMatchObject([
      { kind: 'review_overdue', days: 2, enabled: true, updatedByName: null },
      { kind: 'return_overdue', days: 2, enabled: true },
      { kind: 'deadline_approaching', days: 3, enabled: true },
    ]);
    const updated = await settings.updateReminderRule(admin, 'return_overdue', {
      days: 4,
      enabled: false,
      actorName: 'Admin Test',
    });
    expect(updated).toMatchObject({ kind: 'return_overdue', days: 4, enabled: false });
    expect(updated.updatedByName).toBe('Admin Test');
    const [audit] = await asOwner<{ actor_name: string; details: Record<string, unknown> }>(
      "SELECT actor_name, details FROM audit.audit_log WHERE action = 'reminder_rule.updated'",
    );
    expect(audit).toEqual({ actor_name: 'Admin Test', details: { days: 4, enabled: false } });
    // The review queue's "Past reminder" follows the configured days.
    const review = createReviewRepository(handle.db, testCipher);
    expect(await review.reminderDays(reviewer)).toBe(2);
    await settings.updateReminderRule(admin, 'return_overdue', {
      days: 2,
      enabled: true,
      actorName: 'Admin Test',
    });
  });

  it('refuses an unknown trigger and out-of-range days', async () => {
    await expect(
      refusal(
        settings.updateReminderRule(admin, 'nope' as ReminderKind, {
          days: 2,
          enabled: true,
          actorName: 'x',
        }),
      ),
    ).resolves.toMatchObject({ reason: 'not_found' });
    await expect(
      settings.updateReminderRule(admin, 'review_overdue', {
        days: 31,
        enabled: true,
        actorName: 'x',
      }),
    ).rejects.toThrow(/check/u);
  });
});

describe('criteria settings [R1-05]', () => {
  const edits = (criteria: readonly { code: string }[]): CriterionEdit[] =>
    criteria.map((criterion, index) => ({
      code: criterion.code,
      name:
        index === 0
          ? { en: 'Performance rating', ar: 'تقييم الأداء' }
          : { en: `Rule ${criterion.code}` },
      description: { en: `What ${criterion.code} checks.` },
      justificationRequired: index !== 4,
      evidencePolicy: index === 4 ? 'none' : 'required',
      maxFileMb: 5,
    }));

  it('publishes a new version; requests created before keep theirs', async () => {
    const before = await settings.activeCriteria(admin);
    expect(before.version).toBe(1);
    expect(before.criteria.map((criterion) => criterion.code)).toEqual([
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
    ]);
    const earlier = await request(false);
    const published = await settings.publishCriteria(admin, {
      version: 1,
      criteria: edits(before.criteria),
    });
    expect(published.version).toBe(2);
    expect(published.activatedAt).toBeInstanceOf(Date);
    expect(published.criteria[0]).toMatchObject({
      code: 'C1',
      name: { en: 'Performance rating', ar: 'تقييم الأداء' },
      justificationRequired: true,
      evidencePolicy: 'required',
      maxFileMb: 5,
      // File types are carried over, not editable.
      allowedMediaTypes: before.criteria[0]?.allowedMediaTypes,
    });
    expect(published.criteria[1]?.name).toEqual({ en: 'Rule C2' });
    expect(published.criteria[4]).toMatchObject({
      evidencePolicy: 'none',
      justificationRequired: false,
    });
    expect(await settings.activeCriteria(alpha)).toMatchObject({ id: published.id, version: 2 });
    // Pinned: the earlier draft still shows version 1's criteria; a new one gets version 2's.
    const old = await requests.get(alpha, earlier.id);
    expect(old?.criteria[0]?.name.en).toBe(before.criteria[0]?.name.en);
    const later = await request(false);
    expect((await requests.get(alpha, later.id))?.criteria[0]?.name.en).toBe('Performance rating');
    const sets = await asOwner<{ version: number; status: string }>(
      'SELECT version, status FROM increments.criteria_set ORDER BY version',
    );
    expect(sets).toEqual([
      { version: 1, status: 'retired' },
      { version: 2, status: 'active' },
    ]);
    const [audit] = await asOwner<{ details: Record<string, unknown> }>(
      "SELECT details FROM audit.audit_log WHERE action = 'criteria_set.published'",
    );
    expect(audit?.details).toEqual({ version: 2, previousVersion: 1, criteria: 5 });
  });

  it('refuses a stale version, other codes, and works only with an active set', async () => {
    const active = await settings.activeCriteria(admin);
    await expect(
      refusal(settings.publishCriteria(admin, { version: 1, criteria: edits(active.criteria) })),
    ).resolves.toMatchObject({ reason: 'version_conflict' });
    await expect(
      refusal(
        settings.publishCriteria(admin, {
          version: active.version,
          criteria: edits(active.criteria).slice(0, 4),
        }),
      ),
    ).resolves.toMatchObject({ reason: 'criteria_mismatch' });
    // One more than the set has is refused too.
    await expect(
      refusal(
        settings.publishCriteria(admin, {
          version: active.version,
          criteria: [...edits(active.criteria), ...edits([{ code: 'C6' }])],
        }),
      ),
    ).resolves.toMatchObject({ reason: 'criteria_mismatch' });
    await asOwner("UPDATE increments.criteria_set SET status = 'retired' WHERE status = 'active'");
    try {
      await expect(refusal(settings.activeCriteria(admin))).resolves.toMatchObject({
        reason: 'not_found',
      });
      await expect(
        refusal(settings.publishCriteria(admin, { version: 2, criteria: edits(active.criteria) })),
      ).resolves.toMatchObject({ reason: 'not_found' });
    } finally {
      await asOwner('UPDATE increments.criteria_set SET status = $1 WHERE id = $2', [
        'active',
        active.id,
      ]);
    }
  });
});

describe('reminders on configured triggers [R1-13]', () => {
  it('reminds Sirius HR once about employees waiting past the configured days', async () => {
    const { id } = await request();
    expect(await queueReminders(worker.db)).toBe(0);
    await asOwner(
      "UPDATE increments.increment_request SET submitted_at = now() - interval '3 days' WHERE id = $1",
      [id],
    );
    expect(await queueReminders(worker.db)).toBe(1);
    expect(await reminders(id)).toEqual([
      {
        kind: 'review_overdue',
        recipient_user_id: null,
        recipient_role: REVIEWER_ROLE,
        params: {
          reference: expect.stringMatching(/^INC-/u) as unknown,
          entity: 'SUB-A',
          employees: 2,
          days: 2,
        },
        action_needed: true,
        emails: 1,
      },
    ]);
    // Once per episode, also when two workers run.
    const [first, second] = await Promise.all([
      queueReminders(worker.db),
      queueReminders(worker.db),
    ]);
    expect([first, second]).toEqual([0, 0]);
    // Turned off: nothing.
    await settings.updateReminderRule(admin, 'review_overdue', {
      days: 2,
      enabled: false,
      actorName: 'Admin Test',
    });
    const other = await request();
    await asOwner(
      "UPDATE increments.increment_request SET submitted_at = now() - interval '3 days' WHERE id = $1",
      [other.id],
    );
    expect(await queueReminders(worker.db)).toBe(0);
    await settings.updateReminderRule(admin, 'review_overdue', {
      days: 2,
      enabled: true,
      actorName: 'Admin Test',
    });
    expect(await queueReminders(worker.db)).toBe(1);
  });

  it('reminds the submitter about employees returned and not resubmitted', async () => {
    const { id, lines } = await request();
    const review = createReviewRepository(handle.db, testCipher);
    await review.decide(reviewer, {
      requestId: id,
      lineId: String(lines[0]),
      idempotencyKey: `key-${randomUUID()}`,
      decision: 'returned',
      reasonCode: 'missing_evidence',
      comment: 'Attach the signed appraisal.',
      approved: null,
      actorName: 'Sara',
      notifications: () => [],
    });
    // Its other employee is still waiting for Sirius HR, but not for long.
    expect(await queueReminders(worker.db)).toBe(0);
    await asOwner(
      "UPDATE increments.increment_request SET status_changed_at = now() - interval '3 days' WHERE id = $1",
      [id],
    );
    expect(await queueReminders(worker.db)).toBe(1);
    expect(await reminders(id, alpha.userId)).toEqual([
      {
        kind: 'return_overdue',
        recipient_user_id: alpha.userId,
        recipient_role: null,
        params: { reference: expect.stringMatching(/^INC-/u) as unknown, employees: 1, days: 2 },
        action_needed: true,
        emails: 1,
      },
    ]);
    expect(await queueReminders(worker.db)).toBe(0);
  });

  it('reminds whoever prepares a draft as the deadline nears, in Dubai days', async () => {
    const { id } = await request(false);
    // The placeholder cycle's deadline is far off.
    expect(await queueReminders(worker.db)).toBe(0);
    const [cycle] = await asOwner<{ deadline: string }>(
      'SELECT submission_deadline::text AS deadline FROM core.increment_cycle WHERE id = $1',
      [CYCLE],
    );
    try {
      await asOwner(
        "UPDATE core.increment_cycle SET submission_deadline = (now() AT TIME ZONE 'Asia/Dubai')::date + 2 WHERE id = $1",
        [CYCLE],
      );
      expect(await queueReminders(worker.db)).toBeGreaterThanOrEqual(1);
      const [reminder] = await reminders(id, alpha.userId);
      expect(reminder).toMatchObject({
        kind: 'deadline_approaching',
        recipient_user_id: alpha.userId,
        params: {
          employees: 2,
          days: 2,
          deadline: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u) as unknown,
        },
        action_needed: true,
        emails: 1,
      });
      expect(await queueReminders(worker.db)).toBe(0);
    } finally {
      await asOwner('UPDATE core.increment_cycle SET submission_deadline = $1 WHERE id = $2', [
        cycle?.deadline,
        CYCLE,
      ]);
    }
  });

  it('lets the worker role queue reminders but not read requests or call it as anyone else', async () => {
    const client = new pg.Client({ connectionString: TEST_WORKER_URL });
    const app = new pg.Client({ connectionString: TEST_APP_URL });
    await client.connect();
    await app.connect();
    try {
      await expect(
        client.query('SELECT reference FROM increments.increment_request'),
      ).rejects.toThrow(/permission denied/u);
      await expect(client.query('SELECT * FROM notify.reminder_rule')).rejects.toThrow(
        /permission denied/u,
      );
      await expect(app.query('SELECT notify.queue_reminders()')).rejects.toThrow(
        /permission denied/u,
      );
      await expect(app.query('SELECT * FROM notify.reminder_log')).rejects.toThrow(
        /permission denied/u,
      );
      await expect(
        app.query("UPDATE notify.reminder_rule SET recipient_role = 'x'"),
      ).rejects.toThrow(/permission denied/u);
    } finally {
      await client.end();
      await app.end();
    }
  });
});
