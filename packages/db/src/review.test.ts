import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDashboardRepository } from './dashboard.js';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  RequestDataError,
  type IncrementRequestRepository,
} from './increment-requests.js';
import type { NewNotification } from './notifications.js';
import {
  createReviewRepository,
  statusFromLines,
  type DecisionInput,
  type ReviewRepository,
} from './review.js';
import type { Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL, TEST_OWNER_URL, testCipher } from './test-support/db.js';

// Sirius HR's review (R1-07 … R1-10) against a real database: verification and the stage,
// decisions per employee, returns and resubmission, the queue, and isolation (RLS).
const [SUB_A, SUB_B] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const alpha: Scope = { userId: SEED_ASSIGNMENTS[0].userId, kind: 'entity', entityIds: [SUB_A.id] };
const beta: Scope = { userId: SEED_ASSIGNMENTS[1].userId, kind: 'entity', entityIds: [SUB_B.id] };
const reviewer: Scope = { userId: 'sirius-reviewer', kind: 'group' };
const LONG_AGO = new Date('2000-01-01T00:00:00Z');

let handle: DatabaseHandle;
let requests: IncrementRequestRepository;
let review: ReviewRepository;
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

/** A submitted request of Subsidiary A with two employees: its id, line ids and criteria. */
async function submitted() {
  const { id } = await requests.create(alpha, {
    entityId: SUB_A.id,
    cycleId: CYCLE,
    employeeIds: employees,
    idempotencyKey: `key-${randomUUID()}`,
  });
  const draft = await requests.get(alpha, id);
  await requests.saveDraft(alpha, id, {
    version: 1,
    proposals: (draft?.lines ?? []).map((line) => ({
      lineId: line.id,
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
  const request = await requests.get(reviewer, id);
  return {
    id,
    lines: (request?.lines ?? []).map((line) => line.id),
    criteria: (request?.criteria ?? []).map((criterion) => criterion.id),
  };
}

const stageNotices = (context: { criterion: number; requestId: string }): NewNotification[] => [
  {
    recipient: { userId: SEED_ASSIGNMENTS[0].userId },
    kind: 'stage_changed',
    entityId: SUB_A.id,
    requestId: context.requestId,
    params: { criterion: context.criterion },
  },
];

async function verify(id: string, lineId: string, criterionId: string, verified = true) {
  await review.verify(reviewer, {
    requestId: id,
    lineId,
    criterionId,
    verified,
    actorName: 'Sara Al Mansoori',
    notifications: stageNotices,
  });
}

async function verifyAll(id: string, lineId: string, criteria: readonly string[]) {
  for (const criterionId of criteria) await verify(id, lineId, criterionId);
}

function decision(
  id: string,
  lineId: string | null,
  overrides: Partial<DecisionInput> = {},
): DecisionInput {
  return {
    requestId: id,
    lineId,
    idempotencyKey: `key-${randomUUID()}`,
    decision: 'approved',
    reasonCode: null,
    comment: '',
    approved: null,
    actorName: 'Sara Al Mansoori',
    notifications: (context) => [
      {
        recipient: { userId: context.submittedBy ?? 'nobody' },
        kind: `employee_${context.requestStatus}`,
        entityId: context.entityId,
        requestId: context.requestId,
        params: { employee: context.employeeName, employees: context.employees },
      },
    ],
    ...overrides,
  };
}

async function statusOf(id: string): Promise<string | undefined> {
  return (await requests.get(reviewer, id))?.status;
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
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('statusFromLines [R1-09]', () => {
  it.each([
    [['approved', 'approved'], 'approved'],
    [['rejected', 'rejected'], 'rejected'],
    [['approved', 'rejected'], 'partly_approved'],
    [['approved', 'returned'], 'returned'],
    [['approved', 'pending'], 'under_review'],
    [[], 'under_review'],
  ] as const)('%j → %s', (lines, status) => {
    expect(statusFromLines(lines)).toBe(status);
  });
});

describe('verify [R1-07, R1-10]', () => {
  it('records who checked what, starts the review, and advances the stage', async () => {
    const { id, lines, criteria } = await submitted();
    const [first, second] = lines;
    const [c1, c2] = criteria;
    await verify(id, String(first), String(c1));
    expect(await statusOf(id)).toBe('under_review');
    let request = await requests.get(reviewer, id);
    expect(request?.lines[0]?.criteria[0]?.verification).toMatchObject({
      verifiedByName: 'Sara Al Mansoori',
    });
    expect(request?.lines[1]?.criteria[0]?.verification).toBeNull();
    // The stage moves once C1 is verified for every employee: the subsidiary is told.
    await verify(id, String(second), String(c1));
    const notices = await asOwner<{ kind: string; params: { criterion: number } }>(
      'SELECT kind, params FROM notify.notification WHERE request_id = $1',
      [id],
      alpha.userId,
    );
    expect(notices).toEqual([{ kind: 'stage_changed', params: { criterion: 2 } }]);
    const [summary] = (
      await createDashboardRepository(handle.db, testCipher).requests(reviewer, {
        includeDrafts: false,
        search: id === '' ? 'x' : undefined,
        cycleId: CYCLE,
        entityId: SUB_A.id,
        limit: 50,
        offset: 0,
      })
    ).items.filter((item) => item.id === id);
    expect(summary).toMatchObject({ verifiedCriteria: 1, status: 'under_review' });
    // Verifying twice is harmless; unticking removes it, and the history says so.
    await verify(id, String(first), String(c2));
    await verify(id, String(first), String(c2));
    await verify(id, String(first), String(c2), false);
    request = await requests.get(reviewer, id);
    expect(request?.lines[0]?.criteria[1]?.verification).toBeNull();
    const audit = await asOwner<{ action: string }>(
      "SELECT action FROM audit.audit_log WHERE subject_id = $1 AND action LIKE 'criterion.%' ORDER BY id",
      [first],
    );
    expect(audit.map((row) => row.action)).toEqual([
      'criterion.verified',
      'criterion.verified',
      'criterion.verified',
      'criterion.unverified',
    ]);
  });

  it('refuses a criterion of another set, an unknown line, and a request not in review', async () => {
    const { id, lines, criteria } = await submitted();
    await expect(refusal(verify(id, String(lines[0]), randomUUID()))).resolves.toMatchObject({
      reason: 'criterion_not_found',
    });
    await expect(refusal(verify(id, randomUUID(), String(criteria[0])))).resolves.toMatchObject({
      reason: 'line_not_found',
    });
    await expect(
      refusal(verify(randomUUID(), String(lines[0]), String(criteria[0]))),
    ).resolves.toMatchObject({ reason: 'not_found' });
    const { id: draftId } = await requests.create(alpha, {
      entityId: SUB_A.id,
      cycleId: CYCLE,
      employeeIds: [String(employees[0])],
      idempotencyKey: `key-${randomUUID()}`,
    });
    const draftLine = (await requests.get(alpha, draftId))?.lines[0]?.id;
    await expect(
      refusal(
        review.verify(alpha, {
          requestId: draftId,
          lineId: String(draftLine),
          criterionId: String(criteria[0]),
          verified: true,
          actorName: 'x',
          notifications: () => [],
        }),
      ),
    ).resolves.toMatchObject({ reason: 'not_in_review' });
  });
});

describe('decide [R1-09]', () => {
  it('approves only once every criterion is verified, at a changed increment if given', async () => {
    const { id, lines, criteria } = await submitted();
    const [first, second] = lines;
    await expect(
      refusal(review.decide(reviewer, decision(id, String(first)))),
    ).resolves.toMatchObject({ reason: 'not_verified' });
    await verifyAll(id, String(first), criteria);
    await expect(
      review.decide(
        reviewer,
        decision(id, String(first), {
          approved: { kind: 'percent', value: '4.50' },
          reasonCode: 'budget',
          comment: '  Within this year’s budget band.  ',
        }),
      ),
    ).resolves.toEqual({ replayed: false });
    let request = await requests.get(reviewer, id);
    expect(request?.status).toBe('under_review');
    expect(request?.lines[0]).toMatchObject({
      reviewStatus: 'approved',
      decision: {
        decision: 'approved',
        reasonCode: 'budget',
        comment: 'Within this year’s budget band.',
        approved: { kind: 'percent', value: '4.50' },
        decidedByName: 'Sara Al Mansoori',
      },
    });
    // The comment and the approved value are encrypted at rest.
    const [stored] = await asOwner<{ comment: Buffer }>(
      'SELECT comment FROM increments.line_decision WHERE line_id = $1',
      [first],
    );
    expect(stored?.comment.toString('utf8')).not.toContain('budget band');
    // A decided employee can't be decided again or re-verified.
    await expect(
      refusal(review.decide(reviewer, decision(id, String(first)))),
    ).resolves.toMatchObject({ reason: 'line_not_pending' });
    await expect(
      refusal(verify(id, String(first), String(criteria[0]), false)),
    ).resolves.toMatchObject({ reason: 'line_not_pending' });
    // Rejecting the other makes the request partly approved: final, with its time.
    await review.decide(
      reviewer,
      decision(id, String(second), {
        decision: 'rejected',
        reasonCode: 'criteria_not_met',
        comment: 'C2 not met.',
      }),
    );
    request = await requests.get(reviewer, id);
    expect(request).toMatchObject({ status: 'partly_approved' });
    expect(request?.decidedAt).toBeInstanceOf(Date);
    expect(request?.lines[1]?.decision).toMatchObject({ comment: 'C2 not met.', approved: null });
    const events = await asOwner<{ from_status: string; to_status: string }>(
      'SELECT from_status, to_status FROM increments.status_event WHERE request_id = $1 ORDER BY at',
      [id],
    );
    expect(events.map((event) => `${event.from_status}→${event.to_status}`)).toEqual([
      'draft→submitted',
      'submitted→under_review',
      'under_review→partly_approved',
    ]);
    const notices = await asOwner<{ kind: string; recipient_user_id: string }>(
      "SELECT kind, recipient_user_id FROM notify.notification WHERE request_id = $1 AND kind LIKE 'employee_%' ORDER BY created_at",
      [id],
      alpha.userId,
    );
    expect(notices).toEqual([
      { kind: 'employee_under_review', recipient_user_id: alpha.userId },
      { kind: 'employee_partly_approved', recipient_user_id: alpha.userId },
    ]);
    // Final: nothing more can be verified or decided.
    await expect(
      refusal(review.decide(reviewer, decision(id, String(second)))),
    ).resolves.toMatchObject({ reason: 'not_in_review' });
    // Decisions are append-only, like the status history.
    await expect(
      asOwner('DELETE FROM increments.line_decision WHERE request_id = $1', [id]),
    ).rejects.toThrow(/append-only/u);
  });

  it('replays a repeated key, refuses one used elsewhere, and all-approved or all-rejected', async () => {
    const one = await submitted();
    const key = `key-${randomUUID()}`;
    for (const lineId of one.lines) await verifyAll(one.id, lineId, one.criteria);
    await review.decide(reviewer, decision(one.id, String(one.lines[0]), { idempotencyKey: key }));
    await expect(
      review.decide(reviewer, decision(one.id, String(one.lines[0]), { idempotencyKey: key })),
    ).resolves.toEqual({ replayed: true });
    const other = await submitted();
    await expect(
      refusal(
        review.decide(
          reviewer,
          decision(other.id, String(other.lines[0]), { idempotencyKey: key }),
        ),
      ),
    ).resolves.toMatchObject({ reason: 'idempotency_conflict' });
    await review.decide(reviewer, decision(one.id, String(one.lines[1])));
    expect(await statusOf(one.id)).toBe('approved');
    for (const lineId of other.lines) {
      await review.decide(
        reviewer,
        decision(other.id, lineId, { decision: 'rejected', reasonCode: 'budget' }),
      );
    }
    expect(await statusOf(other.id)).toBe('rejected');
    await expect(
      refusal(review.decide(reviewer, decision(randomUUID(), String(one.lines[0])))),
    ).resolves.toMatchObject({ reason: 'not_found' });
    const third = await submitted();
    await expect(
      refusal(review.decide(reviewer, decision(third.id, randomUUID()))),
    ).resolves.toMatchObject({ reason: 'line_not_found' });
  });
});

describe('decide all remaining [R1-09]', () => {
  it('decides every employee still waiting at once, with one status change and one notice', async () => {
    const { id, lines, criteria } = await submitted();
    const [first, second] = lines.map(String);
    // Approving all needs every criterion verified for every one of them.
    await verifyAll(id, String(first), criteria);
    await expect(refusal(review.decide(reviewer, decision(id, null)))).resolves.toMatchObject({
      reason: 'not_verified',
      subject: second,
    });
    // One employee decided on their own first: "all remaining" leaves them as they are.
    await review.decide(
      reviewer,
      decision(id, String(first), {
        decision: 'returned',
        reasonCode: 'missing_evidence',
        comment: 'Q?',
      }),
    );
    await review.decide(
      reviewer,
      decision(id, null, {
        decision: 'rejected',
        reasonCode: 'budget',
        comment: ' Over budget this cycle. ',
        idempotencyKey: 'key-remaining',
      }),
    );
    const request = await requests.get(reviewer, id);
    expect(request?.lines.map((line) => [line.id, line.reviewStatus])).toEqual([
      [first, 'returned'],
      [second, 'rejected'],
    ]);
    expect(request?.lines.at(1)?.decision).toMatchObject({
      decision: 'rejected',
      reasonCode: 'budget',
      comment: 'Over budget this cycle.',
    });
    const audits = await asOwner<{ details: { allRemaining: boolean } }>(
      "SELECT details FROM audit.audit_log WHERE action = 'request_line.rejected' AND subject_id = $1",
      [second],
    );
    expect(audits.map((row) => row.details.allRemaining)).toEqual([true]);
    const notices = await asOwner<{ params: { employees: number } }>(
      "SELECT params FROM notify.notification WHERE request_id = $1 AND kind = 'employee_returned' ORDER BY created_at",
      [id],
      SEED_ASSIGNMENTS[0].userId,
    );
    expect(notices.map((row) => row.params.employees)).toEqual([1, 1]);
    // Nothing left waiting: refused, and a replay of the same key is still a replay.
    await expect(
      refusal(
        review.decide(reviewer, decision(id, null, { decision: 'rejected', reasonCode: 'budget' })),
      ),
    ).resolves.toMatchObject({ reason: 'line_not_pending' });
    await expect(
      review.decide(reviewer, decision(id, null, { idempotencyKey: 'key-remaining' })),
    ).resolves.toEqual({ replayed: true });
  });

  it('approves all remaining once each is verified, and the request is final', async () => {
    const { id, lines, criteria } = await submitted();
    for (const lineId of lines) await verifyAll(id, lineId, criteria);
    await review.decide(reviewer, decision(id, null));
    expect(await statusOf(id)).toBe('approved');
    const notices = await asOwner<{ params: { employees: number } }>(
      "SELECT params FROM notify.notification WHERE request_id = $1 AND kind = 'employee_approved'",
      [id],
      SEED_ASSIGNMENTS[0].userId,
    );
    expect(notices.map((row) => row.params.employees)).toEqual([2]);
    // Another subsidiary can't decide anything (RLS: the request isn't there for them).
    const other = await submitted();
    await expect(refusal(review.decide(beta, decision(other.id, null)))).resolves.toMatchObject({
      reason: 'not_found',
    });
  });
});

describe('return and resubmit [R1-08]', () => {
  it('returns an employee, lets the subsidiary fix only them, and resubmits for a fresh check', async () => {
    const { id, lines, criteria } = await submitted();
    const [first, second] = lines;
    await verifyAll(id, String(first), criteria);
    await review.decide(
      reviewer,
      decision(id, String(first), {
        decision: 'returned',
        reasonCode: 'missing_evidence',
        comment: 'Attach the 2026 appraisal for C1.',
      }),
    );
    let request = await requests.get(alpha, id);
    expect(request?.status).toBe('returned');
    expect(request?.lines[0]?.decision).toMatchObject({
      decision: 'returned',
      comment: 'Attach the 2026 appraisal for C1.',
    });
    // The returned employee can be edited; the other one, and adding people, can't.
    await requests.saveDraft(alpha, id, {
      version: request?.version ?? 0,
      proposals: [{ lineId: String(first), kind: 'percent', value: '4.00' }],
      assessment: {
        lineId: String(first),
        results: [{ criterionId: String(criteria[0]), result: 'pass', justification: 'Attached.' }],
      },
    });
    request = await requests.get(alpha, id);
    await expect(
      refusal(
        requests.saveDraft(alpha, id, {
          version: request?.version ?? 0,
          proposals: [{ lineId: String(second), kind: 'percent', value: '9.00' }],
        }),
      ),
    ).resolves.toMatchObject({ reason: 'not_draft' });
    await expect(refusal(requests.addLine(alpha, id, String(employees[0])))).resolves.toMatchObject(
      {
        reason: 'not_draft',
      },
    );
    await expect(
      refusal(
        requests.addEvidence(alpha, id, {
          id: randomUUID(),
          lineId: String(second),
          criterionId: String(criteria[0]),
          objectKey: `evidence/${SUB_A.id}/${randomUUID()}`,
          fileName: 'x.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 10,
          sha256: 'a'.repeat(64),
          scanEngine: 'none',
          scannedAt: new Date(),
        }),
      ),
    ).resolves.toMatchObject({ reason: 'not_draft' });
    const evidenceId = randomUUID();
    await requests.addEvidence(alpha, id, {
      id: evidenceId,
      lineId: String(first),
      criterionId: String(criteria[0]),
      objectKey: `evidence/${SUB_A.id}/${randomUUID()}`,
      fileName: 'appraisal.pdf',
      mediaType: 'application/pdf',
      sizeBytes: 10,
      sha256: 'b'.repeat(64),
      scanEngine: 'none',
      scannedAt: new Date(),
    });
    await requests.removeEvidence(alpha, id, evidenceId);
    await expect(refusal(requests.removeEvidence(alpha, id, randomUUID()))).resolves.toMatchObject({
      reason: 'not_draft',
    });
    // Sirius HR can still work on the other employee meanwhile.
    await verify(id, String(second), String(criteria[0]));
    request = await requests.get(alpha, id);
    await expect(
      refusal(
        review.resubmit(alpha, id, {
          version: 1,
          idempotencyKey: `key-${randomUUID()}`,
          note: '',
          notifications: () => [],
        }),
      ),
    ).resolves.toMatchObject({ reason: 'version_conflict' });
    const key = `key-${randomUUID()}`;
    await expect(
      review.resubmit(alpha, id, {
        version: request?.version ?? 0,
        idempotencyKey: key,
        note: 'Appraisal attached for C1.',
        notifications: (context) => [
          {
            recipient: { role: 'PeopleForge.Reviewer' },
            kind: 'request_resubmitted',
            entityId: context.entityId,
            requestId: context.requestId,
            params: { reference: context.reference, employees: context.employees },
          },
        ],
      }),
    ).resolves.toEqual({ replayed: false });
    await expect(
      review.resubmit(alpha, id, {
        version: 0,
        idempotencyKey: key,
        note: '',
        notifications: () => [],
      }),
    ).resolves.toEqual({ replayed: true });
    request = await requests.get(reviewer, id);
    expect(request?.status).toBe('under_review');
    expect(request?.lines[0]).toMatchObject({ reviewStatus: 'pending' });
    // Checked again from scratch: the earlier verifications are gone; the other's stay.
    expect(request?.lines[0]?.criteria.every((c) => c.verification === null)).toBe(true);
    expect(request?.lines[1]?.criteria[0]?.verification).not.toBeNull();
    const [event] = await asOwner<{ reason: string }>(
      "SELECT reason FROM increments.status_event WHERE request_id = $1 AND from_status = 'returned'",
      [id],
    );
    expect(event?.reason).toBe('Appraisal attached for C1.');
    await expect(
      refusal(
        review.resubmit(alpha, id, {
          version: request?.version ?? 0,
          idempotencyKey: `key-${randomUUID()}`,
          note: '',
          notifications: () => [],
        }),
      ),
    ).resolves.toMatchObject({ reason: 'not_returned' });
    // Decided again after the fix: the latest decision is the one shown.
    await verifyAll(id, String(first), criteria);
    await review.decide(reviewer, decision(id, String(first)));
    request = await requests.get(reviewer, id);
    expect(request?.lines[0]?.decision).toMatchObject({ decision: 'approved', comment: '' });
  });
});

describe('queue [R1-07]', () => {
  it('lists employees to review across subsidiaries with counts, filters and isolation', async () => {
    const { id, lines, criteria } = await submitted();
    await verify(id, String(lines[0]), String(criteria[0]));
    await review.decide(
      reviewer,
      decision(id, String(lines[1]), {
        decision: 'returned',
        reasonCode: 'other',
        comment: 'Why?',
      }),
    );
    const query = {
      cycleId: CYCLE,
      entityId: SUB_A.id,
      filter: 'pending' as const,
      overdueBefore: LONG_AGO,
      limit: 50,
      offset: 0,
    };
    const pending = await review.queue(reviewer, { ...query, search: 'Aisha' });
    const row = pending.items.find((item) => item.lineId === lines[0]);
    expect(row).toMatchObject({
      fullName: 'Aisha Rahman',
      reviewStatus: 'pending',
      verified: 1,
      proposedKind: 'percent',
      proposedValue: '5.00',
      currentSalary: '14200.00',
      request: { id, entityCode: 'SUB-A', status: 'returned' },
    });
    expect(row?.results).toHaveLength(5);
    expect(row?.waitingSince).toBeInstanceOf(Date);
    const returned = await review.queue(reviewer, { ...query, filter: 'returned' });
    expect(returned.items.map((item) => item.lineId)).toContain(lines[1]);
    expect(returned.counts.returned).toBeGreaterThanOrEqual(1);
    // Nothing is overdue against a date long past; everything pending is against the future.
    expect((await review.queue(reviewer, { ...query, filter: 'overdue' })).total).toBe(0);
    const overdue = await review.queue(reviewer, {
      ...query,
      filter: 'overdue',
      overdueBefore: new Date('2999-01-01T00:00:00Z'),
    });
    expect(overdue.total).toBe(overdue.counts.pending);
    const everything = await review.queue(reviewer, { ...query, filter: 'all', offset: 0 });
    expect(everything.counts.all).toBeGreaterThanOrEqual(everything.counts.open);
    expect((await review.queue(reviewer, { ...query, filter: 'open' })).total).toBe(
      everything.counts.open,
    );
    expect(everything.counts.openEntities).toBe(1);
    // Another subsidiary sees none of it; an empty page loads nothing else.
    // The user's own % is taken literally; an employee with no increment shows none.
    expect((await review.queue(reviewer, { ...query, search: '100%' })).total).toBe(0);
    const current = await requests.get(alpha, id);
    await requests.saveDraft(alpha, id, {
      version: current?.version ?? 0,
      proposals: [{ lineId: String(lines[1]), kind: null, value: null }],
    });
    const cleared = await review.queue(reviewer, { ...query, filter: 'returned' });
    expect(cleared.items.find((item) => item.lineId === lines[1])).toMatchObject({
      proposedKind: null,
      proposedValue: null,
      verified: 0,
    });
    // Resubmitted without a note: the history records none.
    await review.resubmit(alpha, id, {
      version: (await requests.get(alpha, id))?.version ?? 0,
      idempotencyKey: `key-${randomUUID()}`,
      note: '   ',
      notifications: () => [],
    });
    const [event] = await asOwner<{ reason: string | null }>(
      "SELECT reason FROM increments.status_event WHERE request_id = $1 AND from_status = 'returned'",
      [id],
    );
    expect(event?.reason).toBeNull();
    const theirs = await review.queue(beta, {
      ...query,
      cycleId: undefined,
      entityId: undefined,
      filter: 'all',
    });
    expect(theirs.items).toEqual([]);
    expect(theirs.counts.all).toBe(0);
  });
});
