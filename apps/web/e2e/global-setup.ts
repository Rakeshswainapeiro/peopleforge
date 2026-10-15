import {
  createFieldCipher,
  parseKeyRing,
  runMigrations,
  seedDevelopmentData,
} from '@peopleforge/db';
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
 * Brings the test database up to date in deployment order (core, then web), loads the
 * synthetic seed (subsidiaries, assignments) and starts every run with no sessions.
 */
export default async function globalSetup(): Promise<void> {
  const common = { connectionString: E2E.databaseOwnerUrl, appRole: 'peopleforge_app' };
  await runMigrations('up', { ...common, directory: CORE_MIGRATIONS, module: 'core' });
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
