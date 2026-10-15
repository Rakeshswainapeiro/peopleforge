// CLI: node dist/cli/migrate.js <module> <up|down|status>
// Modules: "core" (packages/db/migrations/core). Other apps call runMigrations() directly.
import path from 'node:path';
import { DEFAULT_WORKER_ROLE, runMigrations, type MigrationCommand } from '../migrator.js';

const MODULES = new Map([['core', 'migrations/core']]);
const [module = '', command = 'status'] = process.argv.slice(2);
const relative = MODULES.get(module);
const connectionString = process.env.DATABASE_OWNER_URL;

if (relative === undefined || !['up', 'down', 'status'].includes(command)) {
  process.stderr.write('Usage: migrate <core> <up|down|status>\n');
  process.exit(1);
}
if (connectionString === undefined || connectionString === '') {
  process.stderr.write('DATABASE_OWNER_URL is required (the schema owner, not the app role).\n');
  process.exit(1);
}

await runMigrations(command as MigrationCommand, {
  connectionString,
  directory: path.join(import.meta.dirname, '..', '..', relative),
  module,
  appRole: process.env.DATABASE_APP_ROLE ?? 'peopleforge_app',
  workerRole: process.env.DATABASE_WORKER_ROLE ?? DEFAULT_WORKER_ROLE,
  report: (line) => process.stdout.write(`${line}\n`),
});
