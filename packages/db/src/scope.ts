import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from './schema.js';

/**
 * Who the queries run for. Row-Level Security reads this (ADR-002): `group` sees every entity,
 * `entity` only the listed ones. An entity scope with no entities sees no entity data.
 */
export type Scope =
  | { userId: string; kind: 'group' }
  | { userId: string; kind: 'entity'; entityIds: readonly string[] };

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entityList(scope: Scope): string {
  if (scope.kind === 'group') return '';
  for (const id of scope.entityIds) {
    if (!UUID.test(id)) throw new ScopeError('Entity IDs must be UUIDs');
  }
  return scope.entityIds.join(',');
}

/**
 * Runs `work` in a transaction whose Row-Level Security scope is `scope`. The settings are
 * transaction-local (set_config(..., true)), so a pooled connection never carries them into
 * the next request. Every database call of the application goes through here.
 */
export async function withScope<T>(
  db: Kysely<Database>,
  scope: Scope,
  work: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  if (scope.userId === '' || scope.userId.length > 128) throw new ScopeError('Invalid user ID');
  const entityIds = entityList(scope);
  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('app.user_id', ${scope.userId}, true),
                     set_config('app.scope', ${scope.kind}, true),
                     set_config('app.entity_ids', ${entityIds}, true)`.execute(trx);
    return work(trx);
  });
}
