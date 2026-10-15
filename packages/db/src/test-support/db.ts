import path from 'node:path';
import { createFieldCipher, parseKeyRing } from '../field-crypto.js';
import { runMigrations } from '../migrator.js';
import { seedDevelopmentData } from '../seed.js';

/**
 * Integration tests run against a real PostgreSQL test database — never the development one.
 * Locally: `peopleforge_test` from ~/sirius/local-infra. CI: the PostgreSQL service.
 */
export const TEST_OWNER_URL =
  process.env.TEST_DATABASE_OWNER_URL ??
  'postgres://peopleforge_owner:local-pf-owner-2026@localhost:55432/peopleforge_test';
export const TEST_APP_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://peopleforge_app:local-pf-app-2026@localhost:55432/peopleforge_test';

export const CORE_MIGRATIONS = path.join(import.meta.dirname, '..', '..', 'migrations', 'core');
/**
 * The web app's sign-in schema: the email outbox reads its `auth.recipient_email` view
 * (ADR-012), so the integration tests bring it up too, as every deployment does (core, then web).
 */
export const WEB_MIGRATIONS = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'apps',
  'web',
  'db',
  'migrations',
);

/** The worker role (ADR-012): reads and marks the email outbox only. */
export const TEST_WORKER_URL =
  process.env.TEST_DATABASE_WORKER_URL ??
  'postgres://peopleforge_worker:local-pf-worker-2026@localhost:55432/peopleforge_test';

export const testCipher = createFieldCipher(
  parseKeyRing(`test-1:${Buffer.alloc(32, 7).toString('base64')}`, 'test-1'),
);

const options = {
  connectionString: TEST_OWNER_URL,
  directory: CORE_MIGRATIONS,
  module: 'core',
  appRole: 'peopleforge_app',
};

/** Drops and recreates the core schema, then loads the synthetic seed. */
export async function resetCoreDatabase(): Promise<void> {
  while ((await runMigrations('down', options)).length > 0) {
    // roll back every applied core migration
  }
  await runMigrations('up', options);
  await runMigrations('up', { ...options, directory: WEB_MIGRATIONS, module: 'web' });
  await seedDevelopmentData({
    connectionString: TEST_OWNER_URL,
    appEnv: 'test',
    cipher: testCipher,
  });
}
