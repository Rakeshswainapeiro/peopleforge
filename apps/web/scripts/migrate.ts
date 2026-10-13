// Applies or rolls back the web app's SQL migrations (db/migrations/NNNN_name.{up,down}.sql).
//
//   node scripts/migrate.ts up        apply every pending migration, each in a transaction
//   node scripts/migrate.ts down      roll back the most recent migration
//   node scripts/migrate.ts status    list applied and pending migrations
//
// Runs as the schema owner (DATABASE_OWNER_URL), never as the app role. {{APP_ROLE}} in the
// SQL is replaced with DATABASE_APP_ROLE (default peopleforge_app), validated as an identifier.
// A session-level advisory lock stops two deployments migrating at once.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const DIR = path.join(import.meta.dirname, '..', 'db', 'migrations');
const LOCK_ID = 7_300_421; // arbitrary, constant per app
const command = process.argv[2] ?? 'status';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const ownerUrl =
  process.env.DATABASE_OWNER_URL ??
  fail('DATABASE_OWNER_URL is required (the schema owner, not the app role).');
const appRole = process.env.DATABASE_APP_ROLE ?? 'peopleforge_app';
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRole)) fail('DATABASE_APP_ROLE is not a plain identifier.');

async function migrations(): Promise<string[]> {
  const files = await readdir(DIR);
  const names = files
    .filter((file) => /^\d{4}_[a-z0-9_]+\.(up|down)\.sql$/.test(file))
    .map((file) => file.replace(/\.(up|down)\.sql$/, ''));
  return [...new Set(names)].sort();
}

async function sql(name: string, direction: 'up' | 'down'): Promise<string> {
  // `name` comes from the directory listing, filtered by the strict pattern above.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- not user input
  const text = await readFile(path.join(DIR, `${name}.${direction}.sql`), 'utf8');
  return text.replaceAll('{{APP_ROLE}}', `"${appRole}"`);
}

const client = new pg.Client({ connectionString: ownerUrl, statement_timeout: 60_000 });
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
  await client.query('CREATE SCHEMA IF NOT EXISTS migrations');
  await client.query(
    'CREATE TABLE IF NOT EXISTS migrations.web (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const rows = await client.query<{ name: string }>('SELECT name FROM migrations.web');
  const applied = new Set(rows.rows.map((row) => row.name));
  const all = await migrations();

  if (command === 'status') {
    for (const name of all) {
      process.stdout.write(`${applied.has(name) ? 'applied ' : 'pending '} ${name}\n`);
    }
  } else if (command === 'up') {
    for (const name of all.filter((n) => !applied.has(n))) {
      await client.query('BEGIN');
      try {
        await client.query(await sql(name, 'up'));
        await client.query('INSERT INTO migrations.web (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        process.stdout.write(`applied  ${name}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } else if (command === 'down') {
    const last = all.filter((n) => applied.has(n)).at(-1);
    if (last === undefined) {
      process.stdout.write('nothing to roll back\n');
    } else {
      await client.query('BEGIN');
      try {
        await client.query(await sql(last, 'down'));
        await client.query('DELETE FROM migrations.web WHERE name = $1', [last]);
        await client.query('COMMIT');
        process.stdout.write(`rolled back ${last}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } else {
    fail(`Unknown command "${command}". Use up, down or status.`);
  }
} finally {
  await client.end();
}
