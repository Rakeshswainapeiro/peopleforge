import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

export interface DatabaseOptions {
  /** Connects as the app role (data access only, ADR-002). */
  connectionString: string;
  poolMax?: number;
}

export interface DatabaseHandle {
  db: Kysely<Database>;
  /** Readiness probe: one round trip. */
  ping: () => Promise<void>;
  close: () => Promise<void>;
}

export function createDatabase(options: DatabaseOptions): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.poolMax ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return {
    db,
    ping: async () => {
      await pool.query('SELECT 1');
    },
    close: () => db.destroy(),
  };
}
