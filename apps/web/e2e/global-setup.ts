import {
  createFieldCipher,
  parseKeyRing,
  runMigrations,
  seedDevelopmentData,
} from '@peopleforge/db';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import pg from 'pg';
import { E2E } from './support/env';

const require = createRequire(import.meta.url);
// Core migrations ship inside @peopleforge/db, next to its package.json.
const CORE_MIGRATIONS = path.join(
  path.dirname(require.resolve('@peopleforge/db/package.json')),
  'migrations',
  'core',
);
const WEB_MIGRATIONS = path.join(import.meta.dirname, '..', 'db', 'migrations');

/**
 * Rebuilds the core schema (every core migration down, then up), brings the web schema up to
 * date, loads the synthetic seed (subsidiaries, assignments, employees) and starts every run
 * with no sessions. The database is shared with the db package's tests, which leave their own
 * data behind (an employee master refreshed from their uploads): each run starts from the seed.
 */
export default async function globalSetup(): Promise<void> {
  // Each run reads only the emails it caused.
  await rm(E2E.emailDir, { recursive: true, force: true });
  const common = { connectionString: E2E.databaseOwnerUrl, appRole: 'peopleforge_app' };
  const core = { ...common, directory: CORE_MIGRATIONS, module: 'core' };
  while ((await runMigrations('down', core)).length > 0) {
    // roll back every applied core migration
  }
  await runMigrations('up', core);
  await runMigrations('up', { ...common, directory: WEB_MIGRATIONS, module: 'web' });
  await seedDevelopmentData({
    connectionString: E2E.databaseOwnerUrl,
    appEnv: 'test',
    cipher: createFieldCipher(parseKeyRing(E2E.dataEncryptionKeys, E2E.dataEncryptionActiveKey)),
  });
  const client = new pg.Client({ connectionString: E2E.databaseOwnerUrl });
  await client.connect();
  try {
    await client.query('TRUNCATE auth.session, auth.account, auth.verification, auth."user"');
    // The placeholder cycle's deadline (30 Nov 2026) would make submitting fail after that day:
    // keep it open in the test database only.
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.scope', 'group', true)");
    await client.query(
      "UPDATE core.increment_cycle SET ends_on = '2099-12-31', submission_deadline = '2099-12-31' WHERE status = 'open'",
    );
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
}
