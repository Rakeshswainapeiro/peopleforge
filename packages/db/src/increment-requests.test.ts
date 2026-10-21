import { randomUUID } from 'node:crypto';
import { MAX_EVIDENCE_PER_CRITERION } from '@peopleforge/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDashboardRepository, type DashboardRepository } from './dashboard.js';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  RequestDataError,
  type IncrementRequestRepository,
  type NewEvidence,
} from './increment-requests.js';
import { withScope, type Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL, TEST_OWNER_URL, testCipher } from './test-support/db.js';

// R1-02 data access against a real database: Row-Level Security, encryption, idempotency and
// the composite keys that keep every line inside its request's subsidiary.
const [SUB_A, SUB_B] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const alpha: Scope = { userId: SEED_ASSIGNMENTS[0].userId, kind: 'entity', entityIds: [SUB_A.id] };
const beta: Scope = { userId: SEED_ASSIGNMENTS[1].userId, kind: 'entity', entityIds: [SUB_B.id] };
const sirius: Scope = { userId: 'sirius-reviewer', kind: 'group' };

let handle: DatabaseHandle;
let repo: IncrementRequestRepository;
let dashboard: DashboardRepository;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });

/** Seeded employee IDs by number (IDs are random per seed). */
const ids = new Map<string, string>();
function employee(number: string): string {
  const id = ids.get(number);
  if (id === undefined) throw new Error(`No seeded employee ${number}`);
  return id;
}

async function asOwner(statement: string, values: unknown[] = []): Promise<void> {
  await owner.query('BEGIN');
  await owner.query("SELECT set_config('app.scope', 'group', true)");
  await owner.query(statement, values);
  await owner.query('COMMIT');
}

/** The IDs of the requests a caller sees, drafts included. */
async function visibleRequests(scope: Scope): Promise<string[]> {
  const page = await dashboard.requests(scope, { includeDrafts: true, limit: 500, offset: 0 });
  return page.items.map((item) => item.id);
}

function key(): string {
  return `test-${randomUUID()}`;
}

async function draft(employees: string[] = ['EMP-1101']): Promise<string> {
  const { id } = await repo.create(alpha, {
    entityId: SUB_A.id,
    cycleId: CYCLE,
    employeeIds: employees.map(employee),
    idempotencyKey: key(),
  });
  return id;
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
  await owner.query('BEGIN');
  await owner.query("SELECT set_config('app.scope', 'group', true)");
  const rows = await owner.query<{ id: string; employee_number: string }>(
    'SELECT id, employee_number FROM core.employee',
  );
  await owner.query('COMMIT');
  for (const row of rows.rows) ids.set(row.employee_number, row.id);
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 4 });
  repo = createIncrementRequestRepository(handle.db, testCipher);
  dashboard = createDashboardRepository(handle.db, testCipher);
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('configuration and employee search', () => {
  it('lists open cycles, newest first, with ISO dates', async () => {
    await asOwner(
      `INSERT INTO core.increment_cycle (name, starts_on, ends_on, status, created_by, updated_by)
       VALUES ('{"en":"Interim 2027"}', '2027-01-01', '2027-06-30', 'open', 't', 't')`,
    );
    const cycles = await repo.openCycles(alpha);
    expect(cycles.map((cycle) => cycle.startsOn)).toEqual(['2027-01-01', '2026-01-01']);
    expect(cycles[0]?.submissionDeadline).toBeNull();
    expect(cycles[1]).toMatchObject({
      id: CYCLE,
      name: { en: 'Increment cycle 2026' },
      endsOn: '2026-12-31',
      submissionDeadline: '2026-11-30',
      status: 'open',
    });
    await asOwner(
      "UPDATE core.increment_cycle SET status = 'closed' WHERE starts_on = '2027-01-01'",
    );
  });

  it('finds active employees of the caller’s subsidiary by name or number', async () => {
    const all = await repo.searchEmployees(alpha, { entityId: SUB_A.id, search: '  ', limit: 50 });
    expect(all.map((e) => e.employeeNumber)).toEqual(['EMP-1101', 'EMP-1103', 'EMP-1102']);
    const byName = await repo.searchEmployees(alpha, {
      entityId: SUB_A.id,
      search: 'AISHA',
      limit: 5,
    });
    expect(byName).toEqual([
      {
        id: employee('EMP-1101'),
        employeeNumber: 'EMP-1101',
        fullName: 'Aisha Rahman',
        grade: 'G5',
      },
    ]);
    const byNumber = await repo.searchEmployees(alpha, {
      entityId: SUB_A.id,
      search: '1102',
      limit: 5,
    });
    expect(byNumber.map((e) => e.fullName)).toEqual(['Yusuf Karim']);
    const wildcard = await repo.searchEmployees(alpha, {
      entityId: SUB_A.id,
      search: '%',
      limit: 5,
    });
    expect(wildcard).toEqual([]);
  });

  it('never returns another subsidiary’s employees [R1-01]', async () => {
    await expect(repo.searchEmployees(alpha, { entityId: SUB_B.id, limit: 50 })).resolves.toEqual(
      [],
    );
  });

  it('can leave out employees already in a request', async () => {
    const id = await draft(['EMP-1101']);
    const rest = await repo.searchEmployees(alpha, {
      entityId: SUB_A.id,
      excludeRequestId: id,
      limit: 50,
    });
    expect(rest.map((e) => e.employeeNumber)).toEqual(['EMP-1103', 'EMP-1102']);
  });
});

describe('create', () => {
  it('creates a numbered draft with a salary snapshot per employee [R1-02]', async () => {
    const id = await draft(['EMP-1101', 'EMP-1102']);
    const request = await repo.get(alpha, id);
    expect(request).toMatchObject({
      id,
      status: 'draft',
      entity: { id: SUB_A.id, code: 'SUB-A', name: { en: 'Subsidiary A' } },
      cycle: { id: CYCLE, name: { en: 'Increment cycle 2026' } },
      version: 1,
    });
    expect(request?.reference).toMatch(/^INC-2026-\d{4}$/);
    expect(request?.criteria.map((criterion) => criterion.code)).toEqual([
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
    ]);
    expect(request?.criteria[0]?.name.en).toBe('[Placeholder] Performance rating');
    expect(
      request?.lines.map((line) => [line.employeeNumber, line.grade, line.currentSalary]),
    ).toEqual([
      ['EMP-1101', 'G5', '14200.00'],
      ['EMP-1102', 'G6', '16800.00'],
    ]);
    expect(request?.lines[0]).toMatchObject({
      currency: 'AED',
      proposedKind: null,
      proposedValue: null,
    });
  });

  it('numbers requests per cycle in sequence', async () => {
    const first = await repo.get(alpha, await draft());
    const second = await repo.get(alpha, await draft());
    const number = (reference = '') => Number(reference.slice(-4));
    expect(number(second?.reference)).toBe(number(first?.reference) + 1);
  });

  it('returns the same draft for a repeated or concurrent idempotency key', async () => {
    const input = { entityId: SUB_A.id, cycleId: CYCLE, employeeIds: [], idempotencyKey: key() };
    const [one, two] = await Promise.all([repo.create(alpha, input), repo.create(alpha, input)]);
    expect(one.id).toBe(two.id);
    expect([one.created, two.created].sort()).toEqual([false, true]);
    await expect(repo.create(alpha, input)).resolves.toEqual({ id: one.id, created: false });
  });

  it('keeps idempotency keys per user', async () => {
    const idempotencyKey = key();
    const mine = await repo.create(alpha, {
      entityId: SUB_A.id,
      cycleId: CYCLE,
      employeeIds: [],
      idempotencyKey,
    });
    const theirs = await repo.create(beta, {
      entityId: SUB_B.id,
      cycleId: CYCLE,
      employeeIds: [],
      idempotencyKey,
    });
    expect(theirs.id).not.toBe(mine.id);
  });

  it('refuses a cycle that is unknown or not open', async () => {
    const input = { entityId: SUB_A.id, employeeIds: [], idempotencyKey: key() };
    expect((await refusal(repo.create(alpha, { ...input, cycleId: randomUUID() }))).reason).toBe(
      'cycle_not_open',
    );
    const closed = await owner.query<{ id: string }>(
      "SELECT id FROM core.increment_cycle WHERE starts_on = '2027-01-01'",
    );
    const error = await refusal(
      repo.create(alpha, { ...input, cycleId: String(closed.rows[0]?.id) }),
    );
    expect(error.reason).toBe('cycle_not_open');
  });

  it('refuses another subsidiary as the request’s entity [R1-01]', async () => {
    const error = await refusal(
      repo.create(alpha, {
        entityId: SUB_B.id,
        cycleId: CYCLE,
        employeeIds: [],
        idempotencyKey: key(),
      }),
    );
    expect(error).toMatchObject({ reason: 'entity_not_found', subject: SUB_B.id });
  });

  it('refuses another subsidiary’s employee, and duplicates, saving nothing', async () => {
    const before = await visibleRequests(alpha);
    const foreign = await refusal(
      repo.create(alpha, {
        entityId: SUB_A.id,
        cycleId: CYCLE,
        employeeIds: [employee('EMP-2201')],
        idempotencyKey: key(),
      }),
    );
    expect(foreign).toMatchObject({ reason: 'employee_not_found', subject: employee('EMP-2201') });
    const duplicate = await refusal(
      repo.create(alpha, {
        entityId: SUB_A.id,
        cycleId: CYCLE,
        employeeIds: [employee('EMP-1101'), employee('EMP-1101')],
        idempotencyKey: key(),
      }),
    );
    expect(duplicate).toMatchObject({
      reason: 'duplicate_employee',
      subject: employee('EMP-1101'),
    });
    expect(await visibleRequests(alpha)).toEqual(before);
  });

  it('refuses when no criteria set is active', async () => {
    await asOwner("UPDATE increments.criteria_set SET status = 'retired'");
    try {
      const error = await refusal(
        repo.create(alpha, {
          entityId: SUB_A.id,
          cycleId: CYCLE,
          employeeIds: [],
          idempotencyKey: key(),
        }),
      );
      expect(error.reason).toBe('no_active_criteria');
    } finally {
      await asOwner("UPDATE increments.criteria_set SET status = 'active' WHERE version = 1");
    }
  });

  it('rethrows unexpected database errors', async () => {
    const tooShort = repo.create(alpha, {
      entityId: SUB_A.id,
      cycleId: CYCLE,
      employeeIds: [],
      idempotencyKey: 'x',
    });
    await expect(tooShort).rejects.toThrow(/check constraint/);
  });
});

describe('visibility [R1-01, R2-12]', () => {
  it('hides a subsidiary’s requests from other subsidiaries and shows them to Sirius', async () => {
    const id = await draft();
    await expect(repo.get(beta, id)).resolves.toBeNull();
    await expect(repo.get(sirius, id)).resolves.toMatchObject({ id });
    expect(await visibleRequests(beta)).not.toContain(id);
    expect(await refusal(repo.addLine(beta, id, employee('EMP-2201')))).toMatchObject({
      reason: 'not_found',
    });
  });

  it('refuses a line whose employee belongs to another subsidiary, at the database', async () => {
    const id = await draft();
    await expect(
      asOwner(
        `INSERT INTO increments.request_line (id, request_id, entity_id, employee_id, employee_number,
           full_name, grade, current_salary, currency, created_by, updated_by)
         VALUES (gen_random_uuid(), $1, $2, $3, 'X', 'X', 'X', '\\x00', 'AED', 't', 't')`,
        [id, SUB_A.id, employee('EMP-2201')],
      ),
    ).rejects.toThrow(/foreign key/);
    await owner.query('ROLLBACK');
  });
});

describe('editing a draft', () => {
  it('adds and removes employees, bumping the version each time', async () => {
    const id = await draft(['EMP-1101']);
    await repo.addLine(alpha, id, employee('EMP-1102'));
    const added = await repo.get(alpha, id);
    expect(added?.version).toBe(2);
    expect(added?.lines.map((line) => line.employeeNumber)).toEqual(['EMP-1101', 'EMP-1102']);

    await expect(repo.removeLine(alpha, id, String(added?.lines[0]?.id))).resolves.toEqual({
      discarded: false,
    });
    const removed = await repo.get(alpha, id);
    expect(removed?.version).toBe(3);
    expect(removed?.lines.map((line) => line.employeeNumber)).toEqual(['EMP-1102']);

    // A removed employee can be added again.
    await repo.addLine(alpha, id, employee('EMP-1101'));
    expect((await repo.get(alpha, id))?.lines).toHaveLength(2);
  });

  it('discards the draft when its last employee is removed', async () => {
    const id = await draft(['EMP-1101']);
    const lineId = String((await repo.get(alpha, id))?.lines[0]?.id);
    await expect(repo.removeLine(alpha, id, lineId)).resolves.toEqual({ discarded: true });
    await expect(repo.get(alpha, id)).resolves.toBeNull();
    expect(await visibleRequests(alpha)).not.toContain(id);
    expect(await refusal(repo.addLine(alpha, id, employee('EMP-1102')))).toMatchObject({
      reason: 'not_found',
    });
  });

  it('refuses duplicates, unknown lines and unknown requests', async () => {
    const id = await draft(['EMP-1101']);
    expect(await refusal(repo.addLine(alpha, id, employee('EMP-1101')))).toMatchObject({
      reason: 'duplicate_employee',
    });
    const lineId = randomUUID();
    expect(await refusal(repo.removeLine(alpha, id, lineId))).toMatchObject({
      reason: 'line_not_found',
      subject: lineId,
    });
    expect(await refusal(repo.removeLine(alpha, randomUUID(), lineId))).toMatchObject({
      reason: 'not_found',
    });
  });

  it('stores proposals encrypted and returns them decrypted', async () => {
    const id = await draft(['EMP-1101', 'EMP-1102']);
    const request = await repo.get(alpha, id);
    const [first, second] = request?.lines ?? [];
    await repo.saveDraft(alpha, id, {
      version: 1,
      proposals: [
        { lineId: String(first?.id), kind: 'percent', value: '8.00' },
        { lineId: String(second?.id), kind: 'amount', value: '1720.00' },
      ],
    });
    const saved = await repo.get(alpha, id);
    expect(saved?.version).toBe(2);
    expect(saved?.lines.map((line) => [line.proposedKind, line.proposedValue])).toEqual([
      ['percent', '8.00'],
      ['amount', '1720.00'],
    ]);
    await owner.query('BEGIN');
    await owner.query("SELECT set_config('app.scope', 'group', true)");
    const raw = await owner.query<{ proposed_value: Buffer }>(
      'SELECT proposed_value FROM increments.request_line WHERE id = $1',
      [first?.id],
    );
    await owner.query('COMMIT');
    // The database holds ciphertext bound to the line (ADR-008), never the figure itself.
    const stored = raw.rows[0]?.proposed_value ?? Buffer.alloc(0);
    expect(stored.toString('latin1')).not.toContain('8.00');
    const context = {
      table: 'increments.request_line',
      column: 'proposed_value',
      rowId: String(first?.id),
    };
    expect(testCipher.decrypt(stored, context)).toBe('8.00');

    await repo.saveDraft(alpha, id, {
      version: 2,
      proposals: [{ lineId: String(first?.id), kind: null, value: null }],
    });
    expect((await repo.get(alpha, id))?.lines[0]).toMatchObject({
      proposedKind: null,
      proposedValue: null,
    });
  });

  it('refuses a stale version and unknown lines', async () => {
    const id = await draft(['EMP-1101']);
    expect(await refusal(repo.saveDraft(alpha, id, { version: 9, proposals: [] }))).toMatchObject({
      reason: 'version_conflict',
    });
    const lineId = randomUUID();
    const error = await refusal(
      repo.saveDraft(alpha, id, {
        version: 1,
        proposals: [{ lineId, kind: 'percent', value: '5' }],
      }),
    );
    expect(error).toMatchObject({ reason: 'line_not_found', subject: lineId });
  });
});

/** A draft with one employee, its line ID and the criteria of its set. */
async function draftWithLine(employees: string[] = ['EMP-1101']) {
  const id = await draft(employees);
  const request = await repo.get(alpha, id);
  if (request === null) throw new Error('draft not found');
  const [line] = request.lines;
  if (line === undefined) throw new Error('draft has no line');
  return { id, request, lineId: line.id, criteria: request.criteria.map((c) => c.id) };
}

function evidence(lineId: string, criterionId: string, overrides: Partial<NewEvidence> = {}) {
  const id = randomUUID();
  return {
    id,
    lineId,
    criterionId,
    objectKey: `evidence/${SUB_A.id}/${id}`,
    fileName: 'appraisal-2026.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 2048,
    sha256: 'a'.repeat(64),
    scanEngine: 'clamav',
    scannedAt: new Date('2026-10-14T08:00:00Z'),
    ...overrides,
  } satisfies NewEvidence;
}

async function rawResult(lineId: string, criterionId: string) {
  await owner.query('BEGIN');
  await owner.query("SELECT set_config('app.scope', 'group', true)");
  const raw = await owner.query<{
    id: string;
    result: string | null;
    justification: Buffer | null;
    measured_value: Buffer | null;
  }>(
    'SELECT id, result, justification, measured_value FROM increments.criterion_result WHERE line_id = $1 AND criterion_id = $2',
    [lineId, criterionId],
  );
  await owner.query('COMMIT');
  return raw.rows[0];
}

describe('criteria configuration on a request [R1-03, R1-05]', () => {
  it('carries what each criterion asks for, and an empty assessment per employee', async () => {
    const { request } = await draftWithLine();
    expect(request.criteria[0]).toMatchObject({
      code: 'C1',
      description: { en: 'Latest appraisal meets the minimum rating.' },
      justificationRequired: true,
      evidencePolicy: 'required',
      maxFileMb: 10,
      // The seeded placeholders are judged Pass or Fail: no threshold.
      threshold: null,
    });
    expect(request.criteria[0]?.allowedMediaTypes).toContain('application/pdf');
    expect(request.criteria[4]?.evidencePolicy).toBe('optional');
    expect(request.lines[0]?.criteria).toEqual(
      request.criteria.map((criterion) => ({
        criterionId: criterion.id,
        result: null,
        measuredValue: null,
        justification: '',
        evidence: [],
        verification: null,
      })),
    );
  });
});

describe('saving criteria with the draft [R1-03]', () => {
  it('saves one employee’s results with the proposals, justification encrypted', async () => {
    const { id, lineId, criteria } = await draftWithLine(['EMP-1101', 'EMP-1102']);
    const [c1, c2] = criteria;
    await repo.saveDraft(alpha, id, {
      version: 1,
      proposals: [{ lineId, kind: 'percent', value: '6.00' }],
      assessment: {
        lineId,
        results: [
          { criterionId: String(c1), result: 'pass', justification: '  Rated 4 of 5 in 2026.  ' },
          { criterionId: String(c2), result: null, justification: '' },
        ],
      },
    });
    const saved = await repo.get(alpha, id);
    expect(saved?.version).toBe(2);
    expect(saved?.lines[0]?.proposedValue).toBe('6.00');
    expect(saved?.lines[0]?.criteria.slice(0, 2)).toMatchObject([
      { criterionId: c1, result: 'pass', justification: 'Rated 4 of 5 in 2026.' },
      { criterionId: c2, result: null, justification: '' },
    ]);
    // The other employee is untouched.
    expect(saved?.lines[1]?.criteria.every((c) => c.result === null)).toBe(true);

    const raw = await rawResult(lineId, String(c1));
    expect(raw?.justification?.toString('latin1')).not.toContain('Rated');
    const context = {
      table: 'increments.criterion_result',
      column: 'justification',
      rowId: String(raw?.id),
    };
    expect(testCipher.decrypt(raw?.justification ?? Buffer.alloc(0), context)).toBe(
      'Rated 4 of 5 in 2026.',
    );
    expect((await rawResult(lineId, String(c2)))?.justification).toBeNull();
  });

  it('stores a measured value encrypted, and clears it [R1-05]', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const c1 = String(criteria[0]);
    await repo.saveDraft(alpha, id, {
      version: 1,
      proposals: [],
      assessment: {
        lineId,
        results: [{ criterionId: c1, result: 'pass', measuredValue: '4.25', justification: '' }],
      },
    });
    expect((await repo.get(alpha, id))?.lines[0]?.criteria[0]).toMatchObject({
      result: 'pass',
      measuredValue: '4.25',
    });
    const row = await rawResult(lineId, c1);
    expect(row?.measured_value?.toString('latin1')).not.toContain('4.25');
    expect(
      testCipher.decrypt(row?.measured_value ?? Buffer.alloc(0), {
        table: 'increments.criterion_result',
        column: 'measured_value',
        rowId: String(row?.id),
      }),
    ).toBe('4.25');
    await repo.saveDraft(alpha, id, {
      version: 2,
      proposals: [],
      assessment: {
        lineId,
        results: [{ criterionId: c1, result: null, measuredValue: null, justification: '' }],
      },
    });
    expect((await repo.get(alpha, id))?.lines[0]?.criteria[0]?.measuredValue).toBeNull();
  });

  it('updates a result in place, keeping its row and clearing an emptied justification', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const c1 = String(criteria[0]);
    await repo.saveDraft(alpha, id, {
      version: 1,
      proposals: [],
      assessment: { lineId, results: [{ criterionId: c1, result: 'pass', justification: 'Yes' }] },
    });
    const before = await rawResult(lineId, c1);
    await repo.saveDraft(alpha, id, {
      version: 2,
      proposals: [],
      assessment: { lineId, results: [{ criterionId: c1, result: 'fail', justification: ' ' }] },
    });
    const after = await rawResult(lineId, c1);
    expect(after).toEqual({
      id: before?.id,
      result: 'fail',
      justification: null,
      measured_value: null,
    });
    await repo.saveDraft(alpha, id, {
      version: 3,
      proposals: [],
      assessment: {
        lineId,
        results: [{ criterionId: c1, result: 'pass', justification: 'Again' }],
      },
    });
    expect((await repo.get(alpha, id))?.lines[0]?.criteria[0]).toMatchObject({
      result: 'pass',
      justification: 'Again',
    });
  });

  it('refuses an unknown line or a criterion outside the request’s set, saving nothing', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const strangerLine = randomUUID();
    expect(
      await refusal(
        repo.saveDraft(alpha, id, {
          version: 1,
          proposals: [{ lineId, kind: 'percent', value: '5' }],
          assessment: { lineId: strangerLine, results: [] },
        }),
      ),
    ).toMatchObject({ reason: 'line_not_found', subject: strangerLine });
    const strangerCriterion = randomUUID();
    expect(
      await refusal(
        repo.saveDraft(alpha, id, {
          version: 1,
          proposals: [{ lineId, kind: 'percent', value: '5' }],
          assessment: {
            lineId,
            results: [
              { criterionId: String(criteria[0]), result: 'pass', justification: 'x' },
              { criterionId: strangerCriterion, result: 'pass', justification: 'x' },
            ],
          },
        }),
      ),
    ).toMatchObject({ reason: 'criterion_not_found', subject: strangerCriterion });
    const unchanged = await repo.get(alpha, id);
    expect(unchanged?.version).toBe(1);
    expect(unchanged?.lines[0]).toMatchObject({ proposedValue: null });
    expect(unchanged?.lines[0]?.criteria[0]?.result).toBeNull();
  });
});

describe('evidence [R1-04]', () => {
  it('records files per criterion without changing the version', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const [c1, c2] = criteria.map(String);
    const first = evidence(lineId, String(c1));
    const record = await repo.addEvidence(alpha, id, first);
    expect(record).toMatchObject({
      id: first.id,
      fileName: 'appraisal-2026.pdf',
      mediaType: 'application/pdf',
      sizeBytes: 2048,
    });
    expect(record.createdAt).toBeInstanceOf(Date);
    await repo.addEvidence(alpha, id, evidence(lineId, String(c2), { fileName: 'b.png' }));
    const request = await repo.get(alpha, id);
    expect(request?.version).toBe(1);
    expect(request?.lines[0]?.criteria[0]?.evidence.map((file) => file.id)).toEqual([first.id]);
    expect(request?.lines[0]?.criteria[1]?.evidence.map((file) => file.fileName)).toEqual([
      'b.png',
    ]);
  });

  it(`caps a criterion at ${String(MAX_EVIDENCE_PER_CRITERION)} live files`, async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const c1 = String(criteria[0]);
    const added = [];
    for (let n = 0; n < MAX_EVIDENCE_PER_CRITERION; n += 1) {
      added.push(await repo.addEvidence(alpha, id, evidence(lineId, c1)));
    }
    expect(await refusal(repo.addEvidence(alpha, id, evidence(lineId, c1)))).toMatchObject({
      reason: 'evidence_limit',
      subject: c1,
    });
    // A removed file frees its slot.
    await repo.removeEvidence(alpha, id, String(added[0]?.id));
    await expect(repo.addEvidence(alpha, id, evidence(lineId, c1))).resolves.toMatchObject({
      fileName: 'appraisal-2026.pdf',
    });
  });

  it('refuses unknown requests, lines and criteria', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const c1 = String(criteria[0]);
    expect(
      await refusal(repo.addEvidence(alpha, randomUUID(), evidence(lineId, c1))),
    ).toMatchObject({ reason: 'not_found' });
    const strangerLine = randomUUID();
    expect(await refusal(repo.addEvidence(alpha, id, evidence(strangerLine, c1)))).toMatchObject({
      reason: 'line_not_found',
      subject: strangerLine,
    });
    const strangerCriterion = randomUUID();
    expect(
      await refusal(repo.addEvidence(alpha, id, evidence(lineId, strangerCriterion))),
    ).toMatchObject({ reason: 'criterion_not_found', subject: strangerCriterion });
  });

  it('soft-deletes a file: gone from the request and from download, kept in the table', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const file = evidence(lineId, String(criteria[0]));
    await repo.addEvidence(alpha, id, file);
    await expect(repo.getEvidence(alpha, id, file.id)).resolves.toEqual({
      id: file.id,
      entityId: SUB_A.id,
      requestStatus: 'draft',
      objectKey: file.objectKey,
      fileName: file.fileName,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
    });
    await repo.removeEvidence(alpha, id, file.id);
    expect((await repo.get(alpha, id))?.lines[0]?.criteria[0]?.evidence).toEqual([]);
    await expect(repo.getEvidence(alpha, id, file.id)).resolves.toBeNull();
    expect(await refusal(repo.removeEvidence(alpha, id, file.id))).toMatchObject({
      reason: 'evidence_not_found',
      subject: file.id,
    });
    await owner.query('BEGIN');
    await owner.query("SELECT set_config('app.scope', 'group', true)");
    const kept = await owner.query<{ deleted_by: string }>(
      'SELECT deleted_by FROM increments.evidence_file WHERE id = $1',
      [file.id],
    );
    await owner.query('COMMIT');
    expect(kept.rows).toEqual([{ deleted_by: alpha.userId }]);
  });

  it('only finds a file through the request it belongs to', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const other = await draftWithLine();
    const file = evidence(lineId, String(criteria[0]));
    await repo.addEvidence(alpha, id, file);
    await expect(repo.getEvidence(alpha, other.id, file.id)).resolves.toBeNull();
    expect(await refusal(repo.removeEvidence(alpha, other.id, file.id))).toMatchObject({
      reason: 'evidence_not_found',
    });
  });

  it('hides files once their employee is removed from the request', async () => {
    const { id, lineId, criteria } = await draftWithLine(['EMP-1101', 'EMP-1102']);
    const file = evidence(lineId, String(criteria[0]));
    await repo.addEvidence(alpha, id, file);
    await repo.removeLine(alpha, id, lineId);
    await expect(repo.getEvidence(alpha, id, file.id)).resolves.toBeNull();
  });

  it('keeps another subsidiary out, and lets Sirius read [R1-01, NFR-SEC-01]', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    const file = evidence(lineId, String(criteria[0]));
    await repo.addEvidence(alpha, id, file);
    await expect(repo.getEvidence(beta, id, file.id)).resolves.toBeNull();
    await expect(repo.getEvidence(sirius, id, file.id)).resolves.toMatchObject({ id: file.id });
    expect(
      await refusal(repo.addEvidence(beta, id, evidence(lineId, String(criteria[0])))),
    ).toMatchObject({ reason: 'not_found' });
    expect(await refusal(repo.removeEvidence(beta, id, file.id))).toMatchObject({
      reason: 'not_found',
    });
    expect(
      await refusal(
        repo.saveDraft(beta, id, {
          version: 1,
          proposals: [],
          assessment: { lineId, results: [] },
        }),
      ),
    ).toMatchObject({ reason: 'not_found' });
  });
});

describe('criteria and evidence at the database [R1-01, NFR-SEC-01]', () => {
  it('refuses rows whose entity differs from their line’s', async () => {
    const { lineId, criteria } = await draftWithLine();
    await expect(
      asOwner(
        `INSERT INTO increments.criterion_result (line_id, entity_id, criterion_id, created_by, updated_by)
         VALUES ($1, $2, $3, 't', 't')`,
        [lineId, SUB_B.id, criteria[0]],
      ),
    ).rejects.toThrow(/foreign key/);
    await owner.query('ROLLBACK');
  });

  it('refuses another subsidiary’s rows under Row-Level Security', async () => {
    const { id, lineId, criteria } = await draftWithLine();
    await repo.addEvidence(alpha, id, evidence(lineId, String(criteria[0])));
    await repo.saveDraft(alpha, id, {
      version: 1,
      proposals: [],
      assessment: {
        lineId,
        results: [{ criterionId: String(criteria[0]), result: 'pass', justification: 'ok' }],
      },
    });
    const seen = await withScope(handle.db, beta, async (trx) => [
      await trx
        .selectFrom('increments.criterion_result')
        .select('id')
        .where('line_id', '=', lineId)
        .execute(),
      await trx
        .selectFrom('increments.evidence_file')
        .select('id')
        .where('line_id', '=', lineId)
        .execute(),
    ]);
    expect(seen).toEqual([[], []]);
    await expect(
      withScope(handle.db, beta, (trx) =>
        trx
          .insertInto('increments.evidence_file')
          .values({ ...evidenceRow(lineId, String(criteria[0])), entity_id: SUB_A.id })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('gives the app role no DELETE on results or evidence', async () => {
    await expect(
      withScope(handle.db, sirius, (trx) => trx.deleteFrom('increments.evidence_file').execute()),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withScope(handle.db, sirius, (trx) =>
        trx.deleteFrom('increments.criterion_result').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('accepts only server-generated object keys', async () => {
    const { lineId, criteria } = await draftWithLine();
    await expect(
      withScope(handle.db, alpha, (trx) =>
        trx
          .insertInto('increments.evidence_file')
          .values({
            ...evidenceRow(lineId, String(criteria[0])),
            object_key: 'evidence/../../etc/passwd',
          })
          .execute(),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

function evidenceRow(lineId: string, criterionId: string) {
  const file = evidence(lineId, criterionId);
  return {
    id: file.id,
    line_id: lineId,
    entity_id: SUB_A.id,
    criterion_id: criterionId,
    object_key: file.objectKey,
    file_name: file.fileName,
    media_type: file.mediaType,
    size_bytes: file.sizeBytes,
    sha256: file.sha256,
    scan_engine: file.scanEngine,
    scanned_at: file.scannedAt,
    created_by: 'test',
  };
}
