import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuditTrailRepository } from './audit-trail.js';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  type IncrementRequestRepository,
} from './increment-requests.js';
import { createReportRepository, REPORT_ROW_LIMIT } from './reports.js';
import { createReviewRepository } from './review.js';
import type { Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL, TEST_OWNER_URL, testCipher } from './test-support/db.js';

// Request history and audited reports (R1-14, R1-15) against a real database: actor names from
// the scope, a request's history for both sides, the whole trail for group scope, and report
// rows with their decisions, logged as downloads.
const [SUB_A, SUB_B] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const alpha: Scope = {
  userId: SEED_ASSIGNMENTS[0].userId,
  userName: 'Alpha HR Test',
  kind: 'entity',
  entityIds: [SUB_A.id],
};
const beta: Scope = { userId: SEED_ASSIGNMENTS[1].userId, kind: 'entity', entityIds: [SUB_B.id] };
const reviewer: Scope = { userId: 'sirius-reviewer', userName: 'Sara Al Mansoori', kind: 'group' };

let handle: DatabaseHandle;
let requests: IncrementRequestRepository;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
let employees: string[] = [];
let requestId = '';
let lines: string[] = [];

beforeAll(async () => {
  await resetCoreDatabase();
  await owner.connect();
  await owner.query('BEGIN');
  await owner.query("SELECT set_config('app.scope', 'group', true)");
  const rows = await owner.query<{ id: string }>(
    "SELECT id FROM core.employee WHERE employee_number IN ('EMP-1101', 'EMP-1102') ORDER BY employee_number",
  );
  await owner.query('COMMIT');
  employees = rows.rows.map((row) => row.id);
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 4 });
  requests = createIncrementRequestRepository(handle.db, testCipher);
  // A request of Subsidiary A: Aisha approved at 4.5%, Yusuf rejected.
  const { id } = await requests.create(alpha, {
    entityId: SUB_A.id,
    cycleId: CYCLE,
    employeeIds: employees,
    idempotencyKey: `key-${randomUUID()}`,
  });
  requestId = id;
  lines = ((await requests.get(alpha, id))?.lines ?? []).map((line) => line.id);
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
  const review = createReviewRepository(handle.db, testCipher);
  const request = await requests.get(reviewer, id);
  for (const criterion of request?.criteria ?? []) {
    await review.verify(reviewer, {
      requestId: id,
      lineId: String(lines[0]),
      criterionId: criterion.id,
      verified: true,
      actorName: 'Sara Al Mansoori',
      notifications: () => [],
    });
  }
  const decide = (lineId: string, decision: 'approved' | 'rejected') =>
    review.decide(reviewer, {
      requestId: id,
      lineId,
      idempotencyKey: `key-${randomUUID()}`,
      decision,
      reasonCode: 'budget',
      comment: 'Budget.',
      approved: decision === 'approved' ? { kind: 'percent', value: '4.50' } : null,
      actorName: 'Sara Al Mansoori',
      notifications: () => [],
    });
  await decide(String(lines[0]), 'approved');
  await decide(String(lines[1]), 'rejected');
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('request history [R1-15]', () => {
  it('lists what happened to the request and its employees, newest first, with names', async () => {
    const history = await createAuditTrailRepository(handle.db).requestHistory(reviewer, requestId);
    const actions = history.map((event) => event.action);
    expect(actions.at(-1)).toBe('increment_request.created');
    expect(actions).toContain('increment_request.submitted');
    expect(actions).toContain('criterion.verified');
    // The last decision, then the final status it caused.
    expect(actions.slice(0, 2)).toEqual([
      'increment_request.status_changed',
      'request_line.rejected',
    ]);
    expect(history.find((event) => event.action === 'increment_request.submitted')).toMatchObject({
      actor: alpha.userId,
      actorName: 'Alpha HR Test',
      entityId: SUB_A.id,
      subjectType: 'increment_request',
      subjectId: requestId,
    });
    expect(history[1]).toMatchObject({ actorName: 'Sara Al Mansoori', subjectId: lines[1] });
  });

  it('shows a subsidiary its own request’s history, and another subsidiary nothing', async () => {
    const trail = createAuditTrailRepository(handle.db);
    const own = await trail.requestHistory(alpha, requestId);
    expect(own.length).toBeGreaterThan(5);
    expect(await trail.requestHistory(beta, requestId)).toEqual([]);
  });
});

describe('audit trail [R1-15]', () => {
  it('finds one user’s actions, by name or action, within dates, paged', async () => {
    const trail = createAuditTrailRepository(handle.db);
    const mine = await trail.trail(reviewer, { actor: reviewer.userId, limit: 3, offset: 0 });
    expect(mine.items).toHaveLength(3);
    expect(mine.total).toBeGreaterThanOrEqual(7);
    expect(mine.items.every((event) => event.actor === reviewer.userId)).toBe(true);
    const byName = await trail.trail(reviewer, { search: 'alpha hr', limit: 50, offset: 0 });
    expect(byName.items.every((event) => event.actorName === 'Alpha HR Test')).toBe(true);
    const byAction = await trail.trail(reviewer, { search: 'rejected', limit: 50, offset: 0 });
    expect(byAction.items.map((event) => event.action)).toContain('request_line.rejected');
    expect((await trail.trail(reviewer, { search: '100%_', limit: 50, offset: 0 })).total).toBe(0);
    const future = new Date('2999-01-01T00:00:00Z');
    expect((await trail.trail(reviewer, { from: future, limit: 5, offset: 0 })).total).toBe(0);
    expect(
      (await trail.trail(reviewer, { to: future, from: new Date(0), limit: 5, offset: 0 })).total,
    ).toBeGreaterThan(0);
    // A subsidiary reads only its own entity's rows.
    const theirs = await trail.trail(beta, { limit: 50, offset: 0 });
    expect(theirs.items.every((event) => event.entityId === SUB_B.id)).toBe(true);
  });
});

describe('group report downloads [R2-06, R2-13]', () => {
  it('records which report, period, format and subsidiary was downloaded, never figures', async () => {
    const reports = createReportRepository(handle.db, testCipher);
    await reports.recordDownload(reviewer, {
      report: 'RP-03',
      format: 'pdf',
      period: '2026-09',
      entityId: SUB_A.id,
    });
    await reports.recordDownload(reviewer, { report: 'RP-06', format: 'pdf', period: '2026-Q3' });
    const { items } = await createAuditTrailRepository(handle.db).trail(reviewer, {
      search: 'report.downloaded',
      limit: 2,
      offset: 0,
    });
    expect(items.map((item) => [item.subjectId, item.entityId, item.details])).toEqual([
      ['RP-06', null, { format: 'pdf', period: '2026-Q3' }],
      ['RP-03', SUB_A.id, { format: 'pdf', period: '2026-09' }],
    ]);
  });
});

describe('increment report data [R1-14, RP-01]', () => {
  it('returns each employee with the latest decision, and logs the download', async () => {
    const reports = createReportRepository(handle.db, testCipher);
    const { lines: rows, truncated } = await reports.incrementLines(
      reviewer,
      { cycleId: CYCLE, entityId: SUB_A.id, includeDrafts: false },
      { report: 'RP-01', format: 'xlsx' },
    );
    expect(truncated).toBe(false);
    const ours = rows.filter((row) => row.request.id === requestId);
    expect(ours).toMatchObject([
      {
        request: {
          reference: expect.stringMatching(/^INC-/u) as unknown,
          status: 'partly_approved',
          entityCode: 'SUB-A',
        },
        employeeNumber: 'EMP-1101',
        currentSalary: '14200.00',
        proposedKind: 'percent',
        proposedValue: '5.00',
        reviewStatus: 'approved',
        decision: { decision: 'approved', approved: { kind: 'percent', value: '4.50' } },
      },
      {
        employeeNumber: 'EMP-1102',
        reviewStatus: 'rejected',
        decision: { decision: 'rejected', approved: null },
      },
    ]);
    expect(ours[0]?.request.decidedAt).toBeInstanceOf(Date);
    const [logged] = (
      await createAuditTrailRepository(handle.db).trail(reviewer, {
        search: 'report.downloaded',
        limit: 1,
        offset: 0,
      })
    ).items;
    expect(logged).toMatchObject({
      actorName: 'Sara Al Mansoori',
      subjectType: 'report',
      subjectId: 'RP-01',
      entityId: SUB_A.id,
      details: { format: 'xlsx', rows: rows.length, cycleId: CYCLE, status: null, search: false },
    });
    expect(REPORT_ROW_LIMIT).toBe(20_000);
  });

  it('includes drafts for the subsidiary, filters by status, and isolates subsidiaries', async () => {
    const reports = createReportRepository(handle.db, testCipher);
    await requests.create(alpha, {
      entityId: SUB_A.id,
      cycleId: CYCLE,
      employeeIds: [String(employees[0])],
      idempotencyKey: `key-${randomUUID()}`,
    });
    const own = await reports.incrementLines(
      alpha,
      { includeDrafts: true, status: 'draft', search: 'Aisha' },
      { report: 'RP-01', format: 'pdf' },
    );
    expect(own.lines.length).toBeGreaterThan(0);
    expect(own.lines.every((row) => row.request.status === 'draft' && row.decision === null)).toBe(
      true,
    );
    expect(own.lines[0]?.proposedValue).toBeNull();
    const theirs = await reports.incrementLines(
      beta,
      { includeDrafts: true },
      { report: 'RP-01', format: 'xlsx' },
    );
    expect(theirs.lines.every((row) => row.request.entityCode === 'SUB-B')).toBe(true);
  });
});
