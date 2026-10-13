import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { FieldCipher } from './field-crypto.js';

/**
 * Synthetic development and test data (never real employees, NFR-PRIV-01): three subsidiaries,
 * the local Keycloak HR users assigned to them, and a few employees each. Refused outside
 * dev/test. Idempotent: running it twice leaves the same rows.
 */
export interface SeedOptions {
  /** Schema owner connection. */
  connectionString: string;
  appEnv: string;
  cipher: FieldCipher;
}

export const SEED_ENTITIES = [
  {
    id: '00000000-0000-4000-8000-0000000e000a',
    code: 'SUB-A',
    name: 'Subsidiary A',
    currency: 'AED',
  },
  {
    id: '00000000-0000-4000-8000-0000000e000b',
    code: 'SUB-B',
    name: 'Subsidiary B',
    currency: 'AED',
  },
  {
    id: '00000000-0000-4000-8000-0000000e000c',
    code: 'SUB-C',
    name: 'Subsidiary C',
    currency: 'AED',
  },
] as const;

/** Local Keycloak user IDs (local-infra realm): pf.alpha.hr → A, pf.beta.hr → B. */
export const SEED_ASSIGNMENTS = [
  { userId: '7d6a1c3e-2b4f-4c8a-9e10-000000000004', entityId: SEED_ENTITIES[0].id },
  { userId: '7d6a1c3e-2b4f-4c8a-9e10-000000000005', entityId: SEED_ENTITIES[1].id },
] as const;

const [SUB_A, SUB_B, SUB_C] = SEED_ENTITIES;

const EMPLOYEES: readonly [(typeof SEED_ENTITIES)[number], string, string, string, string][] = [
  // entity, number, name, grade, monthly salary
  [SUB_A, 'EMP-1101', 'Aisha Rahman', 'G5', '14200.00'],
  [SUB_A, 'EMP-1102', 'Yusuf Karim', 'G6', '16800.00'],
  [SUB_A, 'EMP-1103', 'Mariam Saleh', 'G4', '11500.00'],
  [SUB_B, 'EMP-2201', 'Rohan Das', 'G6', '17100.00'],
  [SUB_B, 'EMP-2202', 'Arjun Mehta', 'G5', '13900.00'],
  [SUB_C, 'EMP-3318', 'Omar Haddad', 'G7', '21500.00'],
  [SUB_C, 'EMP-3324', 'Neha Iyer', 'G6', '16800.00'],
  [SUB_C, 'EMP-3329', 'Daniel Joseph', 'G6', '16800.00'],
  [SUB_C, 'EMP-3336', 'Kavya Menon', 'G6', '16800.00'],
];

export class SeedRefusedError extends Error {
  constructor(appEnv: string) {
    super(`Synthetic seed data is only for dev and test, not "${appEnv}"`);
    this.name = 'SeedRefusedError';
  }
}

export async function seedDevelopmentData(options: SeedOptions): Promise<void> {
  if (options.appEnv !== 'dev' && options.appEnv !== 'test') {
    throw new SeedRefusedError(options.appEnv);
  }
  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    // Row-Level Security is forced on the owner too: act as group scope for the seed.
    await client.query(
      "SELECT set_config('app.scope', 'group', true), set_config('app.user_id', 'seed', true)",
    );
    for (const entity of SEED_ENTITIES) {
      await client.query(
        `INSERT INTO core.entity (id, code, name, default_currency, created_by, updated_by)
         VALUES ($1, $2, jsonb_build_object('en', $3::text), $4, 'seed', 'seed')
         ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name`,
        [entity.id, entity.code, entity.name, entity.currency],
      );
    }
    for (const assignment of SEED_ASSIGNMENTS) {
      await client.query(
        `INSERT INTO core.user_entity (user_id, entity_id, created_by) VALUES ($1, $2, 'seed')
         ON CONFLICT DO NOTHING`,
        [assignment.userId, assignment.entityId],
      );
    }
    for (const [entity, number, name, grade, salary] of EMPLOYEES) {
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM core.employee WHERE entity_id = $1 AND employee_number = $2 AND deleted_at IS NULL',
        [entity.id, number],
      );
      if (existing.rows.length > 0) continue;
      // The row ID is part of the ciphertext's associated data (ADR-008), so it is chosen first.
      const id = randomUUID();
      const ciphertext = options.cipher.encrypt(salary, {
        table: 'core.employee',
        column: 'monthly_salary',
        rowId: id,
      });
      await client.query(
        `INSERT INTO core.employee (id, entity_id, employee_number, full_name, grade, monthly_salary, currency, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'seed', 'seed')`,
        [id, entity.id, number, name, grade, ciphertext, entity.currency],
      );
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
