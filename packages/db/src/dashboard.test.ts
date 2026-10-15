import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCriteriaSets } from './criteria-sets.js';
import {
  containsPattern,
  createDashboardRepository,
  type DashboardOrder,
  type DashboardRepository,
} from './dashboard.js';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  type IncrementRequestRepository,
} from './increment-requests.js';
import type { Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL, TEST_OWNER_URL, testCipher } from './test-support/db.js';

// "My increment requests" (R1-10, DASH-D1) against a real database: filters, search, counts,
// paging, and Row-Level Security keeping each subsidiary to its own rows (R1-01, NFR-SEC-01).
const [SUB_A, SUB_B] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const alpha: Scope = { userId: SEED_ASSIGNMENTS[0].userId, kind: 'entity', entityIds: [SUB_A.id] };
const beta: Scope = { userId: SEED_ASSIGNMENTS[1].userId, kind: 'entity', entityIds: [SUB_B.id] };
const sirius: Scope = { userId: 'sirius-reviewer', kind: 'group' };
const ARABIC_NAME = 'مريم الصالح';

let handle: DatabaseHandle;
let repo: IncrementRequestRepository;
let dashboard: DashboardRepository;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
const employees = new Map<string, string>();

function employee(number: string): string {
  const id = employees.get(number);
  if (id === undefined) throw new Error(`No employee ${number}`);
  return id;
}

async function asOwner<T extends pg.QueryResultRow>(statement: string, values: unknown[] = []) {
  await owner.query('BEGIN');
  await owner.query("SELECT set_config('app.scope', 'group', true)");
  const result = await owner.query<T>(statement, values);
  await owner.query('COMMIT');
  return result.rows;
}

async function draft(scope: Scope, entityId: string, numbers: string[]): Promise<string> {
  const { id } = await repo.create(scope, {
    entityId,
    cycleId: CYCLE,
    employeeIds: numbers.map(employee),
    idempotencyKey: `key-${randomUUID()}`,
  });
  return id;
}

async function submit(scope: Scope, id: string): Promise<void> {
  const request = await repo.get(scope, id);
  await repo.submit(scope, id, {
    version: Number(request?.version),
    idempotencyKey: `submit-${randomUUID()}`,
    submitterName: 'Test HR',
    notifications: () => [],
  });
}

type LineQuery = Parameters<DashboardRepository['lines']>[1] & { order?: DashboardOrder };

/** Everything visible (drafts included), first page, narrowed by `filter`. */
const everything = (filter: Partial<LineQuery> = {}): LineQuery => ({
  includeDrafts: true,
  limit: 50,
  offset: 0,
  ...filter,
});

// Requests created in beforeAll, newest last.
let alphaDraft = '';
let alphaSubmitted = '';
let betaSubmitted = '';
let betaDraft = '';

beforeAll(async () => {
  await resetCoreDatabase();
  await owner.connect();
  // An employee with an Arabic name, to prove search is Unicode-aware.
  const arabicId = randomUUID();
  await asOwner(
    `INSERT INTO core.employee (id, entity_id, employee_number, full_name, grade, monthly_salary,
       currency, created_by, updated_by)
     VALUES ($1, $2, 'EMP-1199', $3, 'G3', $4, 'AED', 'test', 'test')`,
    [
      arabicId,
      SUB_A.id,
      ARABIC_NAME,
      testCipher.encrypt('9000.00', {
        table: 'core.employee',
        column: 'monthly_salary',
        rowId: arabicId,
      }),
    ],
  );
  for (const row of await asOwner<{ id: string; employee_number: string }>(
    'SELECT id, employee_number FROM core.employee',
  )) {
    employees.set(row.employee_number, row.id);
  }
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 4 });
  repo = createIncrementRequestRepository(handle.db, testCipher);
  dashboard = createDashboardRepository(handle.db, testCipher);

  alphaSubmitted = await draft(alpha, SUB_A.id, ['EMP-1101']);
  await submit(alpha, alphaSubmitted);
  betaSubmitted = await draft(beta, SUB_B.id, ['EMP-2201', 'EMP-2202']);
  await submit(beta, betaSubmitted);
  betaDraft = await draft(beta, SUB_B.id, ['EMP-2202']);
  alphaDraft = await draft(alpha, SUB_A.id, ['EMP-1102', 'EMP-1103', 'EMP-1199']);
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('summary', () => {
  it('counts a subsidiary’s requests by status, and the requests and employees matching', async () => {
    await expect(
      dashboard.summary(alpha, { cycleId: CYCLE, includeDrafts: true }),
    ).resolves.toEqual({ byStatus: { draft: 1, submitted: 1 }, requests: 2, employees: 4 });
  });

  it('keeps the cards to the cycle while the tab counts follow every filter', async () => {
    const filtered = await dashboard.summary(alpha, {
      cycleId: CYCLE,
      status: 'draft',
      search: 'mariam',
      includeDrafts: true,
    });
    expect(filtered).toEqual({ byStatus: { draft: 1, submitted: 1 }, requests: 1, employees: 1 });
  });

  it('shows Sirius every subsidiary’s submitted requests, never drafts', async () => {
    await expect(dashboard.summary(sirius, { includeDrafts: false })).resolves.toEqual({
      byStatus: { submitted: 2 },
      requests: 2,
      employees: 3,
    });
  });

  it('counts nothing in another cycle', async () => {
    await expect(
      dashboard.summary(alpha, { cycleId: randomUUID(), includeDrafts: true }),
    ).resolves.toEqual({ byStatus: {}, requests: 0, employees: 0 });
  });
});

describe('requests', () => {
  it('pages a subsidiary’s own requests, newest first, with criteria and per-employee facts', async () => {
    const page = await dashboard.requests(alpha, everything());
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual([alphaDraft, alphaSubmitted]);
    const [newest, oldest] = page.items;
    expect(newest).toMatchObject({
      status: 'draft',
      entity: { id: SUB_A.id, code: 'SUB-A' },
      cycleId: CYCLE,
    });
    expect(newest?.criteria.map((criterion) => criterion.code)).toEqual([
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
    ]);
    expect(newest?.lines).toHaveLength(3);
    expect(newest?.lines[0]?.[0]).toEqual({
      criterionId: newest?.criteria[0]?.id,
      result: null,
      hasJustification: false,
      evidenceCount: 0,
    });
    // A draft's status last changed when it was created; a submitted one, on submission.
    expect(newest?.statusChangedAt.getTime()).toBeGreaterThan(0);
    expect(oldest?.statusChangedAt.getTime()).toBeGreaterThanOrEqual(
      Number(oldest?.createdAt.getTime()),
    );

    // Longest waiting first ("Needs your action").
    const oldestFirst = await dashboard.requests(alpha, everything({ order: 'oldest' }));
    expect(oldestFirst.items.map((item) => item.id)).toEqual([alphaSubmitted, alphaDraft]);

    const second = await dashboard.requests(alpha, everything({ limit: 1, offset: 1 }));
    expect(second.items.map((item) => item.id)).toEqual([alphaSubmitted]);
    expect(second.total).toBe(2);
  });

  it('reflects saved results, justifications and files without reading their content', async () => {
    const request = await repo.get(alpha, alphaDraft);
    const line = String(request?.lines[0]?.id);
    const [c1, c2] = request?.criteria.map((criterion) => criterion.id) ?? [];
    await repo.saveDraft(alpha, alphaDraft, {
      version: Number(request?.version),
      proposals: [{ lineId: line, kind: 'percent', value: '5.00' }],
      assessment: {
        lineId: line,
        results: [
          { criterionId: String(c1), result: 'pass', justification: 'Rated 4 of 5.' },
          { criterionId: String(c2), result: 'fail', justification: '' },
        ],
      },
    });
    for (const fileName of ['a.pdf', 'b.pdf']) {
      const id = randomUUID();
      await repo.addEvidence(alpha, alphaDraft, {
        id,
        lineId: line,
        criterionId: String(c1),
        objectKey: `evidence/${SUB_A.id}/${id}`,
        fileName,
        mediaType: 'application/pdf',
        sizeBytes: 100,
        sha256: 'b'.repeat(64),
        scanEngine: 'clamav',
        scannedAt: new Date(),
      });
    }
    // A file on a criterion with no saved result yet still counts; a removed file doesn't.
    for (const [criterion, removed] of [
      [String(request?.criteria[2]?.id), false],
      [String(request?.criteria[3]?.id), true],
    ] as const) {
      const id = randomUUID();
      await repo.addEvidence(alpha, alphaDraft, {
        id,
        lineId: line,
        criterionId: criterion,
        objectKey: `evidence/${SUB_A.id}/${id}`,
        fileName: 'c.pdf',
        mediaType: 'application/pdf',
        sizeBytes: 100,
        sha256: 'c'.repeat(64),
        scanEngine: 'clamav',
        scannedAt: new Date(),
      });
      if (removed) await repo.removeEvidence(alpha, alphaDraft, id);
    }

    const [item] = (await dashboard.requests(alpha, everything({ status: 'draft' }))).items;
    expect(item?.lines[0]?.slice(0, 4)).toEqual([
      { criterionId: c1, result: 'pass', hasJustification: true, evidenceCount: 2 },
      { criterionId: c2, result: 'fail', hasJustification: false, evidenceCount: 0 },
      {
        criterionId: request?.criteria[2]?.id,
        result: null,
        hasJustification: false,
        evidenceCount: 1,
      },
      {
        criterionId: request?.criteria[3]?.id,
        result: null,
        hasJustification: false,
        evidenceCount: 0,
      },
    ]);
  });

  it('searches references and employees anywhere in the text, case- and script-aware', async () => {
    const reference = (await repo.get(alpha, alphaSubmitted))?.reference ?? '';
    const ids = async (search: string) =>
      (await dashboard.requests(alpha, everything({ search }))).items.map((item) => item.id);
    await expect(ids(reference.slice(-4))).resolves.toEqual([alphaSubmitted]);
    await expect(ids('AISHA')).resolves.toEqual([alphaSubmitted]);
    await expect(ids('emp-110')).resolves.toEqual([alphaDraft, alphaSubmitted]);
    await expect(ids('الصالح')).resolves.toEqual([alphaDraft]);
    // The user's %, _ and \ are literal, not wildcards.
    await expect(ids('%')).resolves.toEqual([]);
    await expect(ids('EMP_1101')).resolves.toEqual([]);
    // Another subsidiary's employees never match.
    await expect(ids('Rohan')).resolves.toEqual([]);
  });

  it('keeps each subsidiary to its own requests and Sirius to submitted ones', async () => {
    const betaPage = await dashboard.requests(beta, everything());
    expect(betaPage.items.map((item) => item.id)).toEqual([betaDraft, betaSubmitted]);
    const siriusPage = await dashboard.requests(sirius, everything({ includeDrafts: false }));
    expect(siriusPage.items.map((item) => item.id)).toEqual([betaSubmitted, alphaSubmitted]);
    expect(siriusPage.items.map((item) => item.entity.code)).toEqual(['SUB-B', 'SUB-A']);
  });

  it('returns an empty page without further queries', async () => {
    await expect(dashboard.requests(alpha, everything({ cycleId: randomUUID() }))).resolves.toEqual(
      { items: [], total: 0 },
    );
  });
});

describe('lines', () => {
  it('pages employees newest request first, in the order they were added', async () => {
    const page = await dashboard.lines(alpha, everything());
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.employeeNumber)).toEqual([
      'EMP-1102',
      'EMP-1103',
      'EMP-1199',
      'EMP-1101',
    ]);
    const [first] = page.items;
    expect(first).toMatchObject({
      request: { id: alphaDraft, status: 'draft', entityCode: 'SUB-A' },
      fullName: 'Yusuf Karim',
      grade: 'G6',
      currency: 'AED',
      currentSalary: '16800.00',
      proposedKind: 'percent',
      proposedValue: '5.00',
    });
    expect(first?.facts[0]).toMatchObject({ result: 'pass', evidenceCount: 2 });
    expect(first?.criteria).toHaveLength(5);
    expect(first?.updatedAt).toBeInstanceOf(Date);
    expect(page.items[1]).toMatchObject({ proposedKind: null, proposedValue: null });
  });

  it('filters by request, status and search, and pages', async () => {
    const numbers = async (filter: LineQuery) =>
      (await dashboard.lines(alpha, filter)).items.map((item) => item.employeeNumber);
    await expect(numbers(everything({ requestId: alphaSubmitted }))).resolves.toEqual(['EMP-1101']);
    await expect(numbers(everything({ status: 'submitted' }))).resolves.toEqual(['EMP-1101']);
    await expect(numbers(everything({ search: 'saleh' }))).resolves.toEqual(['EMP-1103']);
    // A reference matches every employee of that request.
    const reference = (await repo.get(alpha, alphaDraft))?.reference ?? '';
    await expect(numbers(everything({ search: reference }))).resolves.toEqual([
      'EMP-1102',
      'EMP-1103',
      'EMP-1199',
    ]);
    await expect(numbers(everything({ limit: 2, offset: 2 }))).resolves.toEqual([
      'EMP-1199',
      'EMP-1101',
    ]);
  });

  it('never shows another subsidiary’s employees, even when asked for its request', async () => {
    const page = await dashboard.lines(alpha, everything({ requestId: betaSubmitted }));
    expect(page).toEqual({ items: [], total: 0 });
    const siriusLines = await dashboard.lines(sirius, everything({ includeDrafts: false }));
    expect(siriusLines.items.map((item) => item.employeeNumber)).toEqual([
      'EMP-2201',
      'EMP-2202',
      'EMP-1101',
    ]);
  });

  it('leaves removed employees out', async () => {
    const request = await repo.get(alpha, alphaDraft);
    await repo.removeLine(alpha, alphaDraft, String(request?.lines[2]?.id));
    const page = await dashboard.lines(alpha, everything({ requestId: alphaDraft }));
    expect(page.items.map((item) => item.employeeNumber)).toEqual(['EMP-1102', 'EMP-1103']);
  });
});

describe('containsPattern', () => {
  it('wraps the text in % and escapes LIKE’s own characters', () => {
    expect(containsPattern('Omar')).toBe('%Omar%');
    expect(containsPattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  });
});

describe('loadCriteriaSets', () => {
  it('gives no criteria for an unknown set, and loads nothing for no sets', async () => {
    const sets = await loadCriteriaSets(handle.db, []);
    expect(sets.of(randomUUID())).toEqual([]);
  });
});
