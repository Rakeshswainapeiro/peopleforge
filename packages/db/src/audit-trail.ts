import { sql, type Kysely } from 'kysely';
import type { Database } from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Reading the audit trail (R1-15, NFR-AUD-01): one request's history for anyone who can see the
 * request (a subsidiary reads its own entity's rows, migration 0011), and the whole trail for
 * group scope (`audit:read` is checked in the API). The trail is append-only; nothing here writes.
 */

export interface AuditEventRecord {
  id: string;
  at: Date;
  actor: string;
  /** The actor's name as recorded (0011); null for older rows. */
  actorName: string | null;
  action: string;
  entityId: string | null;
  subjectType: string;
  subjectId: string;
  details: Record<string, unknown>;
}

export interface TrailQuery {
  /** One user's actions (their user ID). */
  actor?: string | undefined;
  /** Matches anywhere in the actor's name or ID, or the action. */
  search?: string | undefined;
  from?: Date | undefined;
  /** Exclusive. */
  to?: Date | undefined;
  limit: number;
  offset: number;
}

export interface AuditTrailRepository {
  /** Entries about the request and its employees, files and messages, newest first. */
  requestHistory: (scope: Scope, requestId: string) => Promise<AuditEventRecord[]>;
  trail: (scope: Scope, query: TrailQuery) => Promise<{ items: AuditEventRecord[]; total: number }>;
}

/** Most entries one request's history returns (newest first). */
export const HISTORY_LIMIT = 500;

/** `%text%` for LIKE, with the user's own %, _ and \ taken literally. */
function contains(search: string): string {
  return `%${search.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}

export function createAuditTrailRepository(db: Kysely<Database>): AuditTrailRepository {
  const columns = [
    'id',
    'at',
    'actor',
    'actor_name',
    'action',
    'entity_id',
    'subject_type',
    'subject_id',
    'details',
  ] as const;
  const toRecord = (row: {
    id: string;
    at: Date;
    actor: string;
    actor_name: string | null;
    action: string;
    entity_id: string | null;
    subject_type: string;
    subject_id: string;
    details: Record<string, unknown>;
  }): AuditEventRecord => ({
    id: row.id,
    at: row.at,
    actor: row.actor,
    actorName: row.actor_name,
    action: row.action,
    entityId: row.entity_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    details: row.details,
  });

  return {
    requestHistory: (scope, requestId) =>
      withScope(db, scope, async (trx) => {
        const rows = await trx
          .selectFrom('audit.audit_log')
          .select(columns)
          .where((eb) =>
            eb.or([
              eb.and([
                eb('subject_type', '=', 'increment_request'),
                eb('subject_id', '=', requestId),
              ]),
              sql<boolean>`details ->> 'requestId' = ${requestId}`,
            ]),
          )
          .orderBy('at', 'desc')
          .orderBy('id', 'desc')
          .limit(HISTORY_LIMIT)
          .execute();
        return rows.map(toRecord);
      }),

    trail: (scope, query) =>
      withScope(db, scope, async (trx) => {
        let base = trx.selectFrom('audit.audit_log');
        if (query.actor !== undefined) base = base.where('actor', '=', query.actor);
        if (query.from !== undefined) base = base.where('at', '>=', query.from);
        if (query.to !== undefined) base = base.where('at', '<', query.to);
        if (query.search !== undefined) {
          const pattern = contains(query.search);
          base = base.where(
            sql<boolean>`(lower(coalesce(actor_name, '')) like lower(${pattern})
              or lower(actor) like lower(${pattern}) or lower(action) like lower(${pattern}))`,
          );
        }
        const [rows, count] = await Promise.all([
          base
            .select(columns)
            .orderBy('at', 'desc')
            .orderBy('id', 'desc')
            .limit(query.limit)
            .offset(query.offset)
            .execute(),
          base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow(),
        ]);
        return { items: rows.map(toRecord), total: Number(count.n) };
      }),
  };
}
