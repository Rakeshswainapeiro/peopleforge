import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createIncrementRequestRepository,
  RequestDataError,
  type IncrementRequestRepository,
} from './increment-requests.js';
import type { Scope } from './scope.js';
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
    const before = await repo.list(alpha, { includeDrafts: true, limit: 100, offset: 0 });
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
    expect((await repo.list(alpha, { includeDrafts: true, limit: 100, offset: 0 })).total).toBe(
      before.total,
    );
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
    expect(
      (await repo.list(beta, { includeDrafts: true, limit: 100, offset: 0 })).items.map(
        (r) => r.id,
      ),
    ).not.toContain(id);
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

describe('list', () => {
  it('pages summaries, newest first, with live employee counts', async () => {
    const id = await draft(['EMP-1101', 'EMP-1103']);
    const page = await repo.list(alpha, {
      status: 'draft',
      includeDrafts: true,
      limit: 1,
      offset: 0,
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        id,
        status: 'draft',
        entityId: SUB_A.id,
        cycleId: CYCLE,
        employeeCount: 2,
      }),
    ]);
    expect(page.total).toBeGreaterThan(1);
    const next = await repo.list(alpha, { includeDrafts: true, limit: 1, offset: 1 });
    expect(next.items[0]?.id).not.toBe(id);
  });

  it('leaves drafts out unless asked (Sirius sees submitted requests only)', async () => {
    await expect(
      repo.list(sirius, { includeDrafts: false, limit: 100, offset: 0 }),
    ).resolves.toEqual({
      items: [],
      total: 0,
    });
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
    const drafts = await repo.list(alpha, { includeDrafts: true, limit: 100, offset: 0 });
    expect(drafts.items.map((item) => item.id)).not.toContain(id);
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
    await repo.setProposals(alpha, id, {
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

    await repo.setProposals(alpha, id, {
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
    expect(
      await refusal(repo.setProposals(alpha, id, { version: 9, proposals: [] })),
    ).toMatchObject({
      reason: 'version_conflict',
    });
    const lineId = randomUUID();
    const error = await refusal(
      repo.setProposals(alpha, id, {
        version: 1,
        proposals: [{ lineId, kind: 'percent', value: '5' }],
      }),
    );
    expect(error).toMatchObject({ reason: 'line_not_found', subject: lineId });
  });
});
