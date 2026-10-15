import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import { createEmailOutbox, reasonCode, type EmailOutbox } from './email-outbox.js';
import { SEED_ASSIGNMENTS, SEED_ROLE_MAILBOXES } from './seed.js';
import {
  resetCoreDatabase,
  TEST_APP_URL,
  TEST_OWNER_URL,
  TEST_WORKER_URL,
} from './test-support/db.js';

// The email worker's access (ADR-012, R1-07, R1-13) against a real database: claiming with
// SKIP LOCKED and leases, delivery outcomes, and the worker role's least-privilege grants.
const ALPHA = SEED_ASSIGNMENTS[0].userId;
const BETA = SEED_ASSIGNMENTS[1].userId;
const REVIEWER_ROLE = SEED_ROLE_MAILBOXES[0].role;
const EXECUTIVE_ROLE = 'PeopleForge.Executive';

const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
let worker: DatabaseHandle;
let outbox: EmailOutbox;

async function asOwner<T extends pg.QueryResultRow>(statement: string, values: unknown[] = []) {
  await owner.query('BEGIN');
  try {
    await owner.query(
      "SELECT set_config('app.scope', 'group', true), set_config('app.user_id', 'test', true)",
    );
    const result = await owner.query<T>(statement, values);
    await owner.query('COMMIT');
    return result.rows;
  } catch (error: unknown) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

/** Queues a notification and its email, as the API does when an event commits. */
async function queue(recipient: { userId: string } | { role: string }): Promise<string> {
  const notification = randomUUID();
  await asOwner(
    `INSERT INTO notify.notification (id, recipient_user_id, recipient_role, kind, params, request_id)
     VALUES ($1, $2, $3, 'request_submitted', '{"reference":"INC-2026-0001","employees":2}', NULL)`,
    [
      notification,
      'userId' in recipient ? recipient.userId : null,
      'role' in recipient ? recipient.role : null,
    ],
  );
  const [row] = await asOwner<{ id: string }>(
    'INSERT INTO notify.email_outbox (notification_id) VALUES ($1) RETURNING id',
    [notification],
  );
  return row?.id ?? '';
}

async function row(id: string) {
  const [found] = await asOwner<{
    status: string;
    attempts: number;
    last_error: string | null;
    message_id: string | null;
    sent: boolean;
    wait_seconds: number;
  }>(
    `SELECT status, attempts, last_error, message_id, sent_at IS NOT NULL AS sent,
            round(extract(epoch FROM next_attempt_at - now()))::int AS wait_seconds
     FROM notify.email_outbox WHERE id = $1`,
    [id],
  );
  return found;
}

async function failsAs(client: pg.Client, statement: string): Promise<string> {
  try {
    await client.query(statement);
    return 'allowed';
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

beforeAll(async () => {
  await resetCoreDatabase();
  await owner.connect();
  // Alpha has signed in (the web app stored their email); Beta never has.
  // Left over from an E2E run, maybe: accounts go with their user (ON DELETE CASCADE).
  await owner.query(
    `DELETE FROM auth."user" WHERE email = $1 OR id = $2
       OR id IN (SELECT "userId" FROM auth.account WHERE "accountId" = $3)`,
    ['pf.alpha.hr@sirius.local', 'local-alpha', BETA],
  );
  await owner.query(
    `INSERT INTO auth."user" (id, name, email, "emailVerified", "updatedAt")
     VALUES ('local-alpha', 'Alpha HR', 'pf.alpha.hr@sirius.local', true, now())`,
  );
  await owner.query(
    `INSERT INTO auth.account (id, "accountId", "providerId", "userId", "updatedAt")
     VALUES ('acc-alpha', $1, 'sirius', 'local-alpha', now())`,
    [ALPHA],
  );
  worker = createDatabase({ connectionString: TEST_WORKER_URL, poolMax: 4 });
  outbox = createEmailOutbox(worker.db);
});

beforeEach(async () => {
  // Every test starts with an empty queue.
  await asOwner(
    "UPDATE notify.email_outbox SET status = 'skipped', last_error = 'test_reset' WHERE status = 'pending'",
  );
});

afterAll(async () => {
  await owner.query('DELETE FROM auth."user" WHERE id = $1', ['local-alpha']);
  await owner.end();
  await worker.close();
});

describe('claim', () => {
  it('returns each due email with what to say and where it goes', async () => {
    const toAlpha = await queue({ userId: ALPHA });
    const toReviewers = await queue({ role: REVIEWER_ROLE });
    const jobs = await outbox.claim({ limit: 10, leaseMs: 60_000 });
    expect(jobs).toHaveLength(2);
    expect(jobs.find((job) => job.id === toAlpha)).toEqual({
      id: toAlpha,
      attempts: 0,
      kind: 'request_submitted',
      params: { reference: 'INC-2026-0001', employees: 2 },
      requestId: null,
      recipient: { kind: 'user', userId: ALPHA, address: 'pf.alpha.hr@sirius.local' },
    });
    expect(jobs.find((job) => job.id === toReviewers)?.recipient).toEqual({
      kind: 'role',
      role: REVIEWER_ROLE,
      address: 'pf.reviewers@sirius.local',
    });
  });

  it('has no address for someone who never signed in, or a role without a mailbox', async () => {
    await queue({ userId: BETA });
    await queue({ role: EXECUTIVE_ROLE });
    const jobs = await outbox.claim({ limit: 10, leaseMs: 60_000 });
    expect(jobs.map((job) => job.recipient.address)).toEqual([null, null]);
  });

  it('never gives the same email to two workers, and holds it for the lease', async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => queue({ userId: ALPHA })));
    const [first, second] = await Promise.all([
      outbox.claim({ limit: 4, leaseMs: 60_000 }),
      outbox.claim({ limit: 4, leaseMs: 60_000 }),
    ]);
    const claimed = [...first, ...second].map((job) => job.id);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.sort()).toEqual([...ids].sort());
    // Leased: nothing is due until the lease runs out.
    await expect(outbox.claim({ limit: 10, leaseMs: 60_000 })).resolves.toEqual([]);
    expect((await row(ids[0] ?? ''))?.wait_seconds).toBeGreaterThan(50);
    // A worker died mid-send: once the lease ends, the email is claimed again.
    await asOwner('UPDATE notify.email_outbox SET next_attempt_at = now() WHERE id = $1', [ids[0]]);
    const again = await outbox.claim({ limit: 10, leaseMs: 60_000 });
    expect(again.map((job) => job.id)).toEqual([ids[0]]);
  });

  it('takes the longest-waiting first, up to the limit', async () => {
    const older = await queue({ userId: ALPHA });
    await queue({ userId: ALPHA });
    await asOwner(
      "UPDATE notify.email_outbox SET next_attempt_at = now() - interval '1 hour' WHERE id = $1",
      [older],
    );
    const jobs = await outbox.claim({ limit: 1, leaseMs: 60_000 });
    expect(jobs.map((job) => job.id)).toEqual([older]);
  });
});

describe('finish', () => {
  it('records a sent email once, with its message ID', async () => {
    const id = await queue({ userId: ALPHA });
    await outbox.finish(id, { status: 'sent', messageId: '<abc@peopleforge>' });
    expect(await row(id)).toMatchObject({
      status: 'sent',
      attempts: 1,
      last_error: null,
      message_id: '<abc@peopleforge>',
      sent: true,
    });
    // Already finished: a late duplicate outcome changes nothing.
    await outbox.finish(id, { status: 'dead', reason: 'smtp_550' });
    expect(await row(id)).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('schedules a retry with the reason, then gives up as dead', async () => {
    const id = await queue({ userId: ALPHA });
    await outbox.finish(id, { status: 'retry', delayMs: 300_000, reason: 'smtp_421' });
    const retried = await row(id);
    expect(retried).toMatchObject({ status: 'pending', attempts: 1, last_error: 'smtp_421' });
    expect(retried?.wait_seconds).toBeGreaterThan(290);
    await outbox.finish(id, { status: 'dead', reason: 'Server said: no such user x@y' });
    // Free text never reaches the table.
    expect(await row(id)).toMatchObject({ status: 'dead', attempts: 2, last_error: 'unknown' });
  });

  it('skips an email without counting an attempt', async () => {
    const id = await queue({ role: EXECUTIVE_ROLE });
    await outbox.finish(id, { status: 'skipped', reason: 'no_address' });
    expect(await row(id)).toMatchObject({
      status: 'skipped',
      attempts: 0,
      last_error: 'no_address',
    });
  });
});

describe('stats', () => {
  it('counts pending, due and dead emails and how long the oldest has waited', async () => {
    const before = await outbox.stats();
    const late = await queue({ userId: ALPHA });
    await asOwner(
      "UPDATE notify.email_outbox SET next_attempt_at = now() - interval '2 minutes' WHERE id = $1",
      [late],
    );
    const later = await queue({ userId: ALPHA });
    await outbox.finish(later, { status: 'retry', delayMs: 600_000, reason: 'timeout' });
    const dead = await queue({ userId: ALPHA });
    await outbox.finish(dead, { status: 'dead', reason: 'smtp_550' });
    const stats = await outbox.stats();
    expect(stats).toMatchObject({ pending: before.pending + 2, due: 1, dead: before.dead + 1 });
    expect(stats.oldestDueSeconds).toBeGreaterThanOrEqual(119);
    await outbox.finish(late, { status: 'skipped', reason: 'test_reset' });
    await expect(outbox.stats()).resolves.toMatchObject({ due: 0, oldestDueSeconds: 0 });
  });
});

describe('reasonCode', () => {
  it('keeps short codes and replaces anything else', () => {
    expect(reasonCode('smtp_421')).toBe('smtp_421');
    expect(reasonCode('Mailbox unavailable: a@b.c')).toBe('unknown');
    expect(reasonCode('x'.repeat(65))).toBe('unknown');
  });
});

describe('the worker role (least privilege, ADR-012)', () => {
  const client = new pg.Client({ connectionString: TEST_WORKER_URL });
  const app = new pg.Client({ connectionString: TEST_APP_URL });

  beforeAll(async () => {
    await client.connect();
    await app.connect();
  });

  afterAll(async () => {
    await client.end();
    await app.end();
  });

  it.each([
    'SELECT * FROM increments.increment_request',
    'SELECT * FROM increments.request_line',
    'SELECT * FROM increments.criterion_result',
    'SELECT * FROM core.employee',
    'SELECT * FROM audit.audit_log',
    'SELECT * FROM auth."user"',
    'SELECT * FROM auth.account',
    'SELECT * FROM auth.session',
    'INSERT INTO notify.email_outbox (notification_id) VALUES (gen_random_uuid())',
    'DELETE FROM notify.email_outbox',
    'UPDATE notify.email_outbox SET notification_id = gen_random_uuid()',
    "UPDATE notify.notification SET kind = 'x'",
    "INSERT INTO notify.role_mailbox (role, address, updated_by) VALUES ('x', 'a@b.cd', 'w')",
  ])('is refused: %s', async (statement) => {
    await expect(failsAs(client, statement)).resolves.toBe('42501');
  });

  it('reads only addresses from the sign-in data', async () => {
    const { rows } = await client.query<{ email: string }>(
      'SELECT email FROM auth.recipient_email WHERE user_id = $1',
      [ALPHA],
    );
    expect(rows).toEqual([{ email: 'pf.alpha.hr@sirius.local' }]);
  });

  it('leaves the app role able to queue emails but not read or change them', async () => {
    await expect(failsAs(app, 'SELECT id FROM notify.email_outbox')).resolves.toBe('42501');
    await expect(failsAs(app, "UPDATE notify.email_outbox SET status = 'sent'")).resolves.toBe(
      '42501',
    );
    await expect(failsAs(app, 'SELECT * FROM auth.recipient_email')).resolves.toBe('42501');
  });
});
