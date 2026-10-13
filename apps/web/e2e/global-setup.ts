import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { E2E } from './support/env';

/** Brings the test database's schema up to date and starts every run with no sessions. */
export default async function globalSetup(): Promise<void> {
  execFileSync(
    process.execPath,
    [path.join(import.meta.dirname, '..', 'scripts', 'migrate.ts'), 'up'],
    {
      env: { ...process.env, DATABASE_OWNER_URL: E2E.databaseOwnerUrl },
      stdio: 'inherit',
    },
  );
  const client = new pg.Client({ connectionString: E2E.databaseOwnerUrl });
  await client.connect();
  try {
    await client.query('TRUNCATE auth.session, auth.account, auth.verification, auth."user"');
  } finally {
    await client.end();
  }
}
