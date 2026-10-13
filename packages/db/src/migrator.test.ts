import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMigrations, MigrationError, runMigrations } from './migrator.js';
import { TEST_OWNER_URL } from './test-support/db.js';

// A throwaway module ("migrator_test") with its own schema keeps this away from core.
let directory: string;
const client = new pg.Client({ connectionString: TEST_OWNER_URL });

async function files(entries: Record<string, string>): Promise<void> {
  for (const [name, text] of Object.entries(entries)) {
    await writeFile(path.join(directory, name), text);
  }
}

const options = () => ({
  connectionString: TEST_OWNER_URL,
  directory,
  module: 'migrator_test',
  appRole: 'peopleforge_app',
});

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'pf-migrations-'));
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS migrator_test CASCADE');
  await client.query('DROP TABLE IF EXISTS migrations.migrator_test');
  await files({
    '0001_first.up.sql':
      'CREATE SCHEMA migrator_test; GRANT USAGE ON SCHEMA migrator_test TO {{APP_ROLE}};',
    '0001_first.down.sql': 'DROP SCHEMA migrator_test CASCADE;',
    '0002_second.up.sql': 'CREATE TABLE migrator_test.t (id int);',
    '0002_second.down.sql': 'DROP TABLE migrator_test.t;',
    'README.md': 'not a migration',
  });
});

afterAll(async () => {
  await client.query('DROP SCHEMA IF EXISTS migrator_test CASCADE');
  await client.query('DROP TABLE IF EXISTS migrations.migrator_test');
  await client.end();
  await rm(directory, { recursive: true });
});

describe('runMigrations', () => {
  it('lists only well-named migration files, in order', async () => {
    await expect(listMigrations(directory)).resolves.toEqual(['0001_first', '0002_second']);
  });

  it('applies pending migrations once, substituting the app role', async () => {
    const lines: string[] = [];
    await expect(
      runMigrations('up', { ...options(), report: (l) => lines.push(l) }),
    ).resolves.toEqual(['0001_first', '0002_second']);
    expect(lines).toEqual(['applied  0001_first', 'applied  0002_second']);
    await expect(runMigrations('up', options())).resolves.toEqual([]);
    const usage = await client.query<{ ok: boolean }>(
      "SELECT has_schema_privilege('peopleforge_app', 'migrator_test', 'USAGE') AS ok",
    );
    expect(usage.rows[0]?.ok).toBe(true);
  });

  it('reports status', async () => {
    const lines: string[] = [];
    await files({ '0003_third.up.sql': 'SELECT 1;', '0003_third.down.sql': 'SELECT 1;' });
    await runMigrations('status', { ...options(), report: (l) => lines.push(l) });
    expect(lines).toEqual(['applied  0001_first', 'applied  0002_second', 'pending  0003_third']);
    await rm(path.join(directory, '0003_third.up.sql'));
    await rm(path.join(directory, '0003_third.down.sql'));
  });

  it('rolls back a failing migration entirely and records nothing', async () => {
    await files({
      '0003_broken.up.sql': 'CREATE TABLE migrator_test.half (id int); SELECT broken_syntax(;',
      '0003_broken.down.sql': 'SELECT 1;',
    });
    await expect(runMigrations('up', options())).rejects.toThrow();
    const half = await client.query("SELECT to_regclass('migrator_test.half') AS t");
    expect(half.rows[0]).toEqual({ t: null });
    await rm(path.join(directory, '0003_broken.up.sql'));
    await rm(path.join(directory, '0003_broken.down.sql'));
  });

  it('rolls back the latest migration, then the rest, then reports nothing to do', async () => {
    const lines: string[] = [];
    const report = (line: string) => lines.push(line);
    await expect(runMigrations('down', { ...options(), report })).resolves.toEqual(['0002_second']);
    await expect(runMigrations('down', options())).resolves.toEqual(['0001_first']);
    await expect(runMigrations('down', { ...options(), report })).resolves.toEqual([]);
    await expect(runMigrations('down', options())).resolves.toEqual([]);
    expect(lines).toEqual(['rolled back 0002_second', 'nothing to roll back']);
  });

  it.each([
    ['module', { module: 'core; DROP' }, 'Module is not a plain identifier'],
    ['app role', { appRole: 'app"role' }, 'App role is not a plain identifier'],
  ])('refuses an unsafe %s identifier', async (_label, override, message) => {
    await expect(runMigrations('up', { ...options(), ...override })).rejects.toThrow(
      new MigrationError(message),
    );
  });
});
