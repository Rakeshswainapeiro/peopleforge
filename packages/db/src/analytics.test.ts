import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAnalyticsRepository } from './analytics.js';
import { createConversationRepository } from './conversations.js';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  type IncrementRequestRepository,
} from './increment-requests.js';
import { createReviewRepository, type ReviewRepository } from './review.js';
import type { Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL, TEST_OWNER_URL, testCipher } from './test-support/db.js';

// Turnaround and back-and-forth facts (R1-11, R1-12) from a real review: verifications with
// the time each criterion started waiting, returns with their resubmission, and questions, in
// scope only, with RP-02 downloads audited.
const [SUB_A, SUB_B] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const alpha: Scope = { userId: SEED_ASSIGNMENTS[0].userId, kind: 'entity', entityIds: [SUB_A.id] };
const beta: Scope = { userId: SEED_ASSIGNMENTS[1].userId, kind: 'entity', entityIds: [SUB_B.id] };
const reviewer: Scope = { userId: 'sirius-reviewer', userName: 'Sara', kind: 'group' };

let handle: DatabaseHandle;
let requests: IncrementRequestRepository;
let review: ReviewRepository;
let analytics: ReturnType<typeof createAnalyticsRepository>;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
let employees: string[] = [];

async function asOwner<T extends pg.QueryResultRow>(statement: string, values: unknown[] = []) {
  await owner.query('BEGIN');
  try {
    await owner.query("SELECT set_config('app.scope', 'group', true)");
    const result = await owner.query<T>(statement, values);
    await owner.query('COMMIT');
    return result.rows;
  } catch (error: unknown) {
    await owner.query('ROLLBACK');
    throw error;
  }
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
  review = createReviewRepository(handle.db, testCipher);
  analytics = createAnalyticsRepository(handle.db);
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('analytics facts [R1-11, R1-12]', () => {
  it('records when criteria waited, returns and their resubmission, and questions', async () => {
    // A draft is never measured.
    await requests.create(alpha, {
      entityId: SUB_A.id,
      cycleId: CYCLE,
      employeeIds: employees.slice(0, 1),
      idempotencyKey: `key-${randomUUID()}`,
    });
    const { id } = await requests.create(alpha, {
      entityId: SUB_A.id,
      cycleId: CYCLE,
      employeeIds: employees,
      idempotencyKey: `key-${randomUUID()}`,
    });
    const draft = await requests.get(alpha, id);
    const [aisha, yusuf] = (draft?.lines ?? []).map((line) => line.id);
    const [c1] = (draft?.criteria ?? []).map((criterion) => criterion.id);
    if (aisha === undefined || yusuf === undefined || c1 === undefined) throw new Error('setup');
    await requests.saveDraft(alpha, id, {
      version: 1,
      proposals: [aisha, yusuf].map((lineId) => ({
        lineId,
        kind: 'percent' as const,
        value: '5.00',
      })),
    });
    await requests.submit(alpha, id, {
      version: 2,
      idempotencyKey: `key-${randomUUID()}`,
      submitterName: 'Alpha HR Test',
      notifications: () => [],
    });
    const verify = (lineId: string) =>
      review.verify(reviewer, {
        requestId: id,
        lineId,
        criterionId: c1,
        verified: true,
        actorName: 'Sara',
        notifications: () => [],
      });
    await verify(aisha);
    await review.decide(reviewer, {
      requestId: id,
      lineId: yusuf,
      idempotencyKey: `key-${randomUUID()}`,
      decision: 'returned',
      reasonCode: 'missing_evidence',
      comment: 'Attach the appraisal.',
      approved: null,
      actorName: 'Sara',
      notifications: () => [],
    });
    const conversations = createConversationRepository(handle.db, testCipher);
    const post = (scope: Scope, side: 'sirius' | 'subsidiary') =>
      conversations.post(scope, {
        requestId: id,
        lineId: yusuf,
        side,
        authorName: side === 'sirius' ? 'Sara' : 'Alpha HR Test',
        body: side === 'sirius' ? 'Signed?' : 'Yes.',
        idempotencyKey: `key-${randomUUID()}`,
        notifications: () => [],
      });
    await post(reviewer, 'sirius');
    await post(alpha, 'subsidiary');
    // Still with the subsidiary: the return is open.
    const open = await analytics.facts(reviewer, { entityId: SUB_A.id });
    expect(open.returns.find((item) => item.lineId === yusuf)?.resubmittedAt).toBeNull();
    const current = await requests.get(alpha, id);
    await review.resubmit(alpha, id, {
      version: current?.version ?? 0,
      idempotencyKey: `key-${randomUUID()}`,
      note: '',
      notifications: () => [],
    });
    await verify(yusuf);

    const facts = await analytics.facts(reviewer, { cycleId: CYCLE, entityId: SUB_A.id });
    const request = facts.requests.find((item) => item.id === id);
    expect(request).toMatchObject({ entityCode: 'SUB-A', status: 'under_review', employees: 2 });
    expect(request?.submittedAt).toBeInstanceOf(Date);
    expect(request?.decidedAt).toBeNull();
    expect(facts.requests.every((item) => item.submittedAt instanceof Date)).toBe(true);
    const [returned] = facts.returns.filter((item) => item.requestId === id);
    expect(returned?.lineId).toBe(yusuf);
    expect(returned?.resubmittedAt?.getTime()).toBeGreaterThan(returned?.returnedAt.getTime() ?? 0);
    const mine = facts.verifications.filter((item) => item.requestId === id);
    expect(mine.map((item) => [item.lineId, item.code, item.position])).toEqual([
      [aisha, 'C1', 1],
      [yusuf, 'C1', 1],
    ]);
    // Aisha's C1 waited from submission; Yusuf's from his resubmission.
    expect(mine[0]?.waitingSince.getTime()).toBe(request?.submittedAt.getTime());
    expect(mine[1]?.waitingSince.getTime()).toBe(returned?.resubmittedAt?.getTime());
    expect(facts.messages.filter((item) => item.requestId === id).map((item) => item.side)).toEqual(
      ['sirius', 'subsidiary'],
    );
  });

  it('keeps to the filter and the caller’s scope, and audits a download', async () => {
    expect(await analytics.facts(reviewer, { entityId: SUB_B.id })).toEqual({
      requests: [],
      verifications: [],
      returns: [],
      messages: [],
    });
    const theirs = await analytics.facts(beta, {});
    expect(theirs.requests).toEqual([]);
    expect((await analytics.facts(alpha, {})).requests.length).toBeGreaterThan(0);
    await analytics.facts(reviewer, { cycleId: CYCLE }, { report: 'RP-02', format: 'xlsx' });
    await analytics.facts(reviewer, { entityId: SUB_A.id }, { report: 'RP-02', format: 'xlsx' });
    const audits = await asOwner<{
      subject_id: string;
      entity_id: string | null;
      details: Record<string, unknown>;
    }>(
      "SELECT subject_id, entity_id, details FROM audit.audit_log WHERE action = 'report.downloaded' ORDER BY id",
    );
    expect(audits).toEqual([
      {
        subject_id: 'RP-02',
        entity_id: null,
        details: { format: 'xlsx', rows: 1, cycleId: CYCLE },
      },
      {
        subject_id: 'RP-02',
        entity_id: SUB_A.id,
        details: { format: 'xlsx', rows: 1, cycleId: null },
      },
    ]);
  });
});
