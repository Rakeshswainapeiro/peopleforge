// Applies or rolls back the web app's `auth` migrations (db/migrations/NNNN_name.{up,down}.sql)
// with the shared runner from @peopleforge/db (ADR-002), recorded in migrations.web.
//
//   node scripts/migrate.ts up | down | status
//
// Runs as the schema owner (DATABASE_OWNER_URL), never as the app role.

import path from 'node:path';
import { runMigrations, type MigrationCommand } from '@peopleforge/db';

const command = process.argv[2] ?? 'status';
const connectionString = process.env.DATABASE_OWNER_URL ?? '';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!['up', 'down', 'status'].includes(command))
  fail(`Unknown command "${command}". Use up, down or status.`);
if (connectionString === '')
  fail('DATABASE_OWNER_URL is required (the schema owner, not the app role).');

await runMigrations(command as MigrationCommand, {
  connectionString,
  directory: path.join(import.meta.dirname, '..', 'db', 'migrations'),
  module: 'web',
  appRole: process.env.DATABASE_APP_ROLE ?? 'peopleforge_app',
  report: (line) => process.stdout.write(`${line}\n`),
});
