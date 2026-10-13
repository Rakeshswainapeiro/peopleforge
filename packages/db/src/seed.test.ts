import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDevelopmentData, SeedRefusedError } from './seed.js';
import { resetCoreDatabase, TEST_OWNER_URL, testCipher } from './test-support/db.js';

const client = new pg.Client({ connectionString: TEST_OWNER_URL });

async function counts(): Promise<Record<string, number>> {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.scope', 'group', true)");
  const result = await client.query<{ entities: number; assignments: number; employees: number }>(
    `SELECT (SELECT count(*)::int FROM core.entity) AS entities,
            (SELECT count(*)::int FROM core.user_entity) AS assignments,
            (SELECT count(*)::int FROM core.employee) AS employees`,
  );
  await client.query('COMMIT');
  return { ...result.rows[0] };
}

beforeAll(async () => {
  await resetCoreDatabase();
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe('synthetic seed (NFR-PRIV-01)', () => {
  it.each(['uat', 'prod', ''])('refuses to run in "%s"', async (appEnv) => {
    await expect(
      seedDevelopmentData({ connectionString: TEST_OWNER_URL, appEnv, cipher: testCipher }),
    ).rejects.toBeInstanceOf(SeedRefusedError);
  });

  it('is idempotent', async () => {
    const before = await counts();
    await seedDevelopmentData({
      connectionString: TEST_OWNER_URL,
      appEnv: 'dev',
      cipher: testCipher,
    });
    expect(await counts()).toEqual(before);
    expect(before).toEqual({ entities: 3, assignments: 2, employees: 9 });
  });

  it('rolls back everything when a write fails', async () => {
    const failing = {
      encrypt: () => {
        throw new Error('vault unavailable');
      },
      decrypt: testCipher.decrypt,
    };
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.scope', 'group', true)");
    await client.query('UPDATE core.employee SET deleted_at = now() WHERE employee_number = $1', [
      'EMP-1101',
    ]);
    await client.query('COMMIT');
    await expect(
      seedDevelopmentData({ connectionString: TEST_OWNER_URL, appEnv: 'test', cipher: failing }),
    ).rejects.toThrow('vault unavailable');
    expect((await counts()).employees).toBe(9);
  });
});
