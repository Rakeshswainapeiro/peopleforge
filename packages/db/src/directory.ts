import type { Kysely } from 'kysely';
import type { Database, LocalisedText } from './schema.js';
import { withScope, type Scope } from './scope.js';

export interface EntitySummary {
  id: string;
  code: string;
  name: LocalisedText;
}

/**
 * Users, entities and their assignments (R1-01, R2-12). Reads go through Row-Level Security
 * like everything else: a user can only read their own assignments.
 */
export interface EntityDirectory {
  /** Entities a (Subsidiary HR) user is assigned to. */
  assignedEntityIds: (userId: string) => Promise<string[]>;
  /** Entities visible in a scope, ordered by code. */
  entities: (scope: Scope) => Promise<EntitySummary[]>;
}

export function createEntityDirectory(db: Kysely<Database>): EntityDirectory {
  return {
    assignedEntityIds: (userId) =>
      withScope(db, { userId, kind: 'entity', entityIds: [] }, async (trx) => {
        const rows = await trx
          .selectFrom('core.user_entity')
          .select('entity_id')
          .where('user_id', '=', userId)
          .orderBy('entity_id')
          .execute();
        return rows.map((row) => row.entity_id);
      }),
    entities: (scope) =>
      withScope(db, scope, (trx) =>
        trx
          .selectFrom('core.entity')
          .select(['id', 'code', 'name'])
          .where('deleted_at', 'is', null)
          .orderBy('code')
          .execute(),
      ),
  };
}
