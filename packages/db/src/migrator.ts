import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export type MigrationCommand = 'up' | 'down' | 'status';

export interface MigrationOptions {
  /** Schema owner connection (never the app role). */
  connectionString: string;
  /** Directory of NNNN_name.up.sql / NNNN_name.down.sql files. */
  directory: string;
  /** Tracking table name in schema `migrations`, e.g. "core" or "web". */
  module: string;
  /** Role granted data access in the SQL via {{APP_ROLE}}. */
  appRole: string;
  /** The email worker's role (ADR-012), via {{WORKER_ROLE}}. Default `peopleforge_worker`. */
  workerRole?: string;
  /** Lines of progress output. */
  report?: (line: string) => void;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
export const DEFAULT_WORKER_ROLE = 'peopleforge_worker';
const FILE = /^(\d{4}_[a-z0-9_]+)\.(up|down)\.sql$/;
// Constant per database, shared by every module, so two deployments never migrate at once.
const LOCK_ID = 7_300_421;

export async function listMigrations(directory: string): Promise<string[]> {
  const names = new Set<string>();
  // The directory is fixed by the calling app's configuration, never request input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted configuration
  for (const file of await readdir(directory)) {
    const match = FILE.exec(file);
    if (match?.[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

async function readSql(options: MigrationOptions, name: string, direction: 'up' | 'down') {
  // `name` comes from the directory listing, filtered by the strict pattern above.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- not user input
  const text = await readFile(path.join(options.directory, `${name}.${direction}.sql`), 'utf8');
  return text
    .replaceAll('{{APP_ROLE}}', `"${options.appRole}"`)
    .replaceAll('{{WORKER_ROLE}}', `"${options.workerRole ?? DEFAULT_WORKER_ROLE}"`);
}

async function inTransaction(client: pg.Client, work: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await work();
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Applies pending migrations (`up`), rolls back the latest (`down`) or lists them (`status`).
 * Each migration runs in its own transaction under an advisory lock; applied names are
 * recorded in `migrations.<module>`. Returns the names applied, rolled back or listed.
 */
export async function runMigrations(
  command: MigrationCommand,
  options: MigrationOptions,
): Promise<string[]> {
  if (!IDENTIFIER.test(options.module))
    throw new MigrationError('Module is not a plain identifier');
  if (!IDENTIFIER.test(options.appRole))
    throw new MigrationError('App role is not a plain identifier');
  if (!IDENTIFIER.test(options.workerRole ?? DEFAULT_WORKER_ROLE))
    throw new MigrationError('Worker role is not a plain identifier');
  const report = options.report ?? (() => undefined);
  const table = `migrations.${options.module}`;

  const client = new pg.Client({
    connectionString: options.connectionString,
    statement_timeout: 60_000,
  });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query('CREATE SCHEMA IF NOT EXISTS migrations');
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${table} (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    const rows = await client.query<{ name: string }>(`SELECT name FROM ${table}`);
    const applied = new Set(rows.rows.map((row) => row.name));
    const all = await listMigrations(options.directory);

    if (command === 'status') {
      for (const name of all) report(`${applied.has(name) ? 'applied ' : 'pending '} ${name}`);
      return all;
    }

    if (command === 'up') {
      const pending = all.filter((name) => !applied.has(name));
      for (const name of pending) {
        const sql = await readSql(options, name, 'up');
        await inTransaction(client, async () => {
          await client.query(sql);
          await client.query(`INSERT INTO ${table} (name) VALUES ($1)`, [name]);
        });
        report(`applied  ${name}`);
      }
      return pending;
    }

    const last = all.filter((name) => applied.has(name)).at(-1);
    if (last === undefined) {
      report('nothing to roll back');
      return [];
    }
    const sql = await readSql(options, last, 'down');
    await inTransaction(client, async () => {
      await client.query(sql);
      await client.query(`DELETE FROM ${table} WHERE name = $1`, [last]);
    });
    report(`rolled back ${last}`);
    return [last];
  } finally {
    await client.end();
  }
}
