import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { withScope, type Scope } from './scope.js';
import { resetCoreDatabase, TEST_APP_URL, testCipher } from './test-support/db.js';

// Entity isolation proven at the database (R1-01, R2-12, NFR-SEC-01, ADR-002): these queries
// run as the app role and deliberately omit entity filters, so only Row-Level Security decides.
const [SUB_A, SUB_B] = SEED_ENTITIES;
const ALPHA = SEED_ASSIGNMENTS[0].userId;
const alphaScope: Scope = { userId: ALPHA, kind: 'entity', entityIds: [SUB_A.id] };
const groupScope: Scope = { userId: 'sirius-admin', kind: 'group' };

let handle: DatabaseHandle;

beforeAll(async () => {
  await resetCoreDatabase();
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 2 });
});

afterAll(async () => {
  await handle.close();
});

describe('Row-Level Security', () => {
  it('shows no entity data when the transaction has no scope', async () => {
    const entities = await handle.db.selectFrom('core.entity').selectAll().execute();
    const employees = await handle.db.selectFrom('core.employee').selectAll().execute();
    const assignments = await handle.db.selectFrom('core.user_entity').selectAll().execute();
    expect([entities, employees, assignments]).toEqual([[], [], []]);
  });

  it('lets group scope see every entity and employee', async () => {
    const [entities, employees] = await withScope(handle.db, groupScope, async (trx) => [
      await trx.selectFrom('core.entity').select('code').orderBy('code').execute(),
      await trx.selectFrom('core.employee').select('id').execute(),
    ]);
    expect(entities.map((row) => row.code)).toEqual(['SUB-A', 'SUB-B', 'SUB-C']);
    expect(employees).toHaveLength(9);
  });

  it('limits an entity scope to its own subsidiary', async () => {
    const employees = await withScope(handle.db, alphaScope, (trx) =>
      trx.selectFrom('core.employee').select(['entity_id', 'employee_number']).execute(),
    );
    expect(employees).toHaveLength(3);
    expect(new Set(employees.map((row) => row.entity_id))).toEqual(new Set([SUB_A.id]));
  });

  it('refuses inserting an employee into another subsidiary', async () => {
    await expect(
      withScope(handle.db, alphaScope, (trx) =>
        trx
          .insertInto('core.employee')
          .values({
            entity_id: SUB_B.id,
            employee_number: 'EMP-9999',
            full_name: 'Cross Entity',
            grade: 'G1',
            monthly_salary: Buffer.from('x'),
            currency: 'AED',
            created_by: ALPHA,
            updated_by: ALPHA,
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('updates nothing in another subsidiary and cannot move a row there', async () => {
    const updated = await withScope(handle.db, alphaScope, (trx) =>
      trx
        .updateTable('core.employee')
        .set({ grade: 'G9' })
        .where('entity_id', '=', SUB_B.id)
        .executeTakeFirst(),
    );
    expect(updated.numUpdatedRows).toBe(0n);
    await expect(
      withScope(handle.db, alphaScope, (trx) =>
        trx.updateTable('core.employee').set({ entity_id: SUB_B.id }).execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('lets a subsidiary read its own entity but not edit it', async () => {
    const renamed = await withScope(handle.db, alphaScope, (trx) =>
      trx
        .updateTable('core.entity')
        .set({ code: 'HACKED' })
        .where('id', '=', SUB_A.id)
        .executeTakeFirst(),
    );
    expect(renamed.numUpdatedRows).toBe(0n);
    const own = await withScope(handle.db, alphaScope, (trx) =>
      trx.selectFrom('core.entity').select('code').execute(),
    );
    expect(own).toEqual([{ code: 'SUB-A' }]);
  });

  it('gives the app role no DELETE on business tables', async () => {
    await expect(
      withScope(handle.db, groupScope, (trx) => trx.deleteFrom('core.employee').execute()),
    ).rejects.toThrow(/permission denied/);
  });

  it('shows a user only their own assignments, and only group scope manages them', async () => {
    const own = await withScope(handle.db, alphaScope, (trx) =>
      trx.selectFrom('core.user_entity').select(['user_id', 'entity_id']).execute(),
    );
    expect(own).toEqual([{ user_id: ALPHA, entity_id: SUB_A.id }]);
    await expect(
      withScope(handle.db, alphaScope, (trx) =>
        trx
          .insertInto('core.user_entity')
          .values({ user_id: ALPHA, entity_id: SUB_B.id, created_by: ALPHA })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('lets every scope read configuration: the open cycle and five placeholder criteria', async () => {
    const [cycles, criteria] = await withScope(handle.db, alphaScope, async (trx) => [
      await trx.selectFrom('core.increment_cycle').select('status').execute(),
      await trx.selectFrom('increments.criterion').select('code').orderBy('position').execute(),
    ]);
    expect(cycles).toEqual([{ status: 'open' }]);
    expect(criteria.map((row) => row.code)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
  });

  it('stores salaries only as ciphertext bound to their row (ADR-008)', async () => {
    const row = await withScope(handle.db, groupScope, (trx) =>
      trx
        .selectFrom('core.employee')
        .select(['id', 'monthly_salary'])
        .where('employee_number', '=', 'EMP-3318')
        .executeTakeFirstOrThrow(),
    );
    expect(row.monthly_salary.toString('utf8')).not.toContain('21500');
    const context = { table: 'core.employee', column: 'monthly_salary', rowId: row.id };
    expect(testCipher.decrypt(row.monthly_salary, context)).toBe('21500.00');
  });

  it('does not leak scope settings to the next transaction on a pooled connection', async () => {
    await withScope(handle.db, groupScope, () => Promise.resolve());
    const result = await sql<{
      scope: string | null;
    }>`SELECT current_setting('app.scope', true) AS scope`.execute(handle.db);
    expect(result.rows[0]?.scope ?? '').toBe('');
  });
});
