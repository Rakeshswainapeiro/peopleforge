import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from './schema.js';
import { withScope, type Scope } from './scope.js';

/** Who a notification is for: one user, or everyone holding a role (Sirius users). */
export type Recipient = { userId: string } | { role: string };

/** A notification to create with an event (R1-07, R1-13). Also queued for email. */
export interface NewNotification {
  recipient: Recipient;
  kind: string;
  entityId: string | null;
  requestId: string | null;
  /** Display values for the message (reference, counts, actor name); never pay or text. */
  params: Record<string, string | number>;
  actionNeeded?: boolean;
}

export interface NotificationRecord {
  id: string;
  kind: string;
  requestId: string | null;
  params: Record<string, string | number>;
  actionNeeded: boolean;
  createdAt: Date;
  read: boolean;
}

export interface NotificationQuery {
  /** The caller's roles: role-addressed notifications match on these. */
  roles: readonly string[];
  filter: 'all' | 'unread' | 'action_needed';
  limit: number;
  offset: number;
}

export interface NotificationRepository {
  list: (
    scope: Scope,
    query: NotificationQuery,
  ) => Promise<{ items: NotificationRecord[]; total: number; unread: number }>;
  /** Marks the given notifications read, or all of the caller's when `ids` is undefined. */
  markRead: (
    scope: Scope,
    input: { roles: readonly string[]; ids?: readonly string[] | undefined },
  ) => Promise<void>;
}

/**
 * Creates notifications and queues one email each (outbox), in the caller's transaction, so
 * they exist exactly when the event commits.
 */
export async function insertNotifications(
  trx: Transaction<Database>,
  notifications: readonly NewNotification[],
): Promise<void> {
  for (const notification of notifications) {
    // The ID is chosen here, not RETURNed: a subsidiary may create a notification for Sirius HR
    // but not read it back (RETURNING is checked against the SELECT policy).
    const id = randomUUID();
    await trx
      .insertInto('notify.notification')
      .values({
        id,
        recipient_user_id:
          'userId' in notification.recipient ? notification.recipient.userId : null,
        recipient_role: 'role' in notification.recipient ? notification.recipient.role : null,
        entity_id: notification.entityId,
        request_id: notification.requestId,
        kind: notification.kind,
        params: JSON.stringify(notification.params),
        action_needed: notification.actionNeeded ?? false,
      })
      .execute();
    await trx.insertInto('notify.email_outbox').values({ notification_id: id }).execute();
  }
}

/**
 * Reads a caller's notifications under Row-Level Security: their own, plus those addressed to
 * a role they hold (role-addressed rows are readable from group scope only).
 */
export function createNotificationRepository(db: Kysely<Database>): NotificationRepository {
  const visible = (trx: Transaction<Database>, userId: string, roles: readonly string[]) =>
    trx
      .selectFrom('notify.notification as n')
      .leftJoin('notify.notification_read as r', (join) =>
        join.onRef('r.notification_id', '=', 'n.id').on('r.user_id', '=', userId),
      )
      .where((eb) =>
        eb.or([
          eb('n.recipient_user_id', '=', userId),
          ...(roles.length === 0 ? [] : [eb('n.recipient_role', 'in', [...roles])]),
        ]),
      );

  return {
    list: (scope, query) =>
      withScope(db, scope, async (trx) => {
        let base = visible(trx, scope.userId, query.roles);
        const unread = await base
          .where('r.user_id', 'is', null)
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow();
        if (query.filter === 'unread') base = base.where('r.user_id', 'is', null);
        if (query.filter === 'action_needed') base = base.where('n.action_needed', '=', true);
        const total = await base
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow();
        const rows = await base
          .select([
            'n.id',
            'n.kind',
            'n.request_id',
            'n.params',
            'n.action_needed',
            'n.created_at',
            sql<boolean>`r.user_id IS NOT NULL`.as('read'),
          ])
          .orderBy('n.created_at', 'desc')
          .orderBy('n.id')
          .limit(query.limit)
          .offset(query.offset)
          .execute();
        return {
          total: Number(total.n),
          unread: Number(unread.n),
          items: rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            requestId: row.request_id,
            params: row.params,
            actionNeeded: row.action_needed,
            createdAt: row.created_at,
            read: row.read,
          })),
        };
      }),

    markRead: (scope, input) =>
      withScope(db, scope, async (trx) => {
        let unread = visible(trx, scope.userId, input.roles)
          .where('r.user_id', 'is', null)
          .select('n.id');
        if (input.ids !== undefined) {
          if (input.ids.length === 0) return;
          unread = unread.where('n.id', 'in', [...input.ids]);
        }
        const rows = await unread.execute();
        if (rows.length === 0) return;
        await trx
          .insertInto('notify.notification_read')
          .values(rows.map((row) => ({ notification_id: row.id, user_id: scope.userId })))
          .onConflict((oc) => oc.columns(['notification_id', 'user_id']).doNothing())
          .execute();
      }),
  };
}
