import { sql, type Kysely } from 'kysely';
import type { Database } from './schema.js';

/** Who an email goes to, with the address known for them (null: none, so it is skipped). */
export type OutboxRecipient =
  | { kind: 'user'; userId: string; address: string | null }
  | { kind: 'role'; role: string; address: string | null };

/** One queued email, claimed for sending: the notification it tells about and its recipient. */
export interface OutboxJob {
  id: string;
  /** Attempts before this one. */
  attempts: number;
  kind: string;
  params: Record<string, string | number>;
  requestId: string | null;
  recipient: OutboxRecipient;
}

/** How an attempt ended. Reasons are short codes (`smtp_550`, `no_address`), never server text. */
export type OutboxOutcome =
  | { status: 'sent'; messageId: string }
  | { status: 'retry'; delayMs: number; reason: string }
  | { status: 'dead'; reason: string }
  | { status: 'skipped'; reason: string };

export interface OutboxStats {
  pending: number;
  /** Pending and due now: a growing number means the worker is behind or stuck. */
  due: number;
  dead: number;
  /** Seconds the oldest due email has waited; 0 when none is due. */
  oldestDueSeconds: number;
}

export interface EmailOutbox {
  /**
   * Claims up to `limit` due emails for `leaseMs`: other workers skip them meanwhile. A worker
   * that dies mid-send leaves them to be claimed again when the lease ends (at least once).
   */
  claim: (options: { limit: number; leaseMs: number }) => Promise<OutboxJob[]>;
  /** Records how the attempt ended; a no-op if the row is no longer pending. */
  finish: (id: string, outcome: OutboxOutcome) => Promise<void>;
  stats: () => Promise<OutboxStats>;
}

const REASON = /^[a-z0-9_]{1,64}$/u;

/** A reason code as stored (the column's CHECK); anything else becomes `unknown`. */
export function reasonCode(reason: string): string {
  return REASON.test(reason) ? reason : 'unknown';
}

const milliseconds = (value: number) => sql<Date>`now() + make_interval(secs => ${value / 1000})`;

/**
 * The email worker's view of `notify.email_outbox` (ADR-012). Connects as the worker role,
 * which may read the outbox, notifications, role mailboxes and `auth.recipient_email`, and
 * update delivery columns: nothing else. Times come from the database clock.
 */
export function createEmailOutbox(db: Kysely<Database>): EmailOutbox {
  return {
    claim: async ({ limit, leaseMs }) => {
      // One statement: lease the due rows nobody else holds, then read what each email says
      // and where it goes (a user's sign-in email, or their role's mailbox).
      const { rows } = await sql<{
        id: string;
        attempts: number;
        kind: string;
        params: Record<string, string | number>;
        request_id: string | null;
        recipient_kind: 'user' | 'role';
        recipient: string;
        address: string | null;
      }>`
        WITH claimed AS (
          UPDATE notify.email_outbox
          SET next_attempt_at = ${milliseconds(leaseMs)}
          WHERE id IN (
            SELECT id FROM notify.email_outbox
            WHERE status = 'pending' AND next_attempt_at <= now()
            ORDER BY next_attempt_at
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, notification_id, attempts
        )
        SELECT c.id, c.attempts, n.kind, n.params, n.request_id,
               CASE WHEN n.recipient_user_id IS NULL THEN 'role' ELSE 'user' END AS recipient_kind,
               coalesce(n.recipient_user_id, n.recipient_role) AS recipient,
               CASE WHEN n.recipient_user_id IS NULL THEN m.address ELSE e.email END AS address
        FROM claimed c
        JOIN notify.notification n ON n.id = c.notification_id
        LEFT JOIN notify.role_mailbox m ON m.role = n.recipient_role
        LEFT JOIN auth.recipient_email e ON e.user_id = n.recipient_user_id
      `.execute(db);
      return rows.map((row) => ({
        id: row.id,
        attempts: row.attempts,
        kind: row.kind,
        params: row.params,
        requestId: row.request_id,
        recipient:
          row.recipient_kind === 'user'
            ? { kind: 'user', userId: row.recipient, address: row.address }
            : { kind: 'role', role: row.recipient, address: row.address },
      }));
    },

    finish: async (id, outcome) => {
      const pending = db
        .updateTable('notify.email_outbox')
        .where('id', '=', id)
        .where('status', '=', 'pending');
      switch (outcome.status) {
        case 'sent':
          await pending
            .set((eb) => ({
              status: 'sent',
              sent_at: sql<Date>`now()`,
              message_id: outcome.messageId.slice(0, 998),
              attempts: eb('attempts', '+', 1),
              last_error: null,
            }))
            .execute();
          return;
        case 'retry':
          await pending
            .set((eb) => ({
              next_attempt_at: milliseconds(outcome.delayMs),
              attempts: eb('attempts', '+', 1),
              last_error: reasonCode(outcome.reason),
            }))
            .execute();
          return;
        case 'dead':
          await pending
            .set((eb) => ({
              status: 'dead',
              attempts: eb('attempts', '+', 1),
              last_error: reasonCode(outcome.reason),
            }))
            .execute();
          return;
        case 'skipped':
          // Nothing was attempted: the attempt count stays as it was.
          await pending
            .set({ status: 'skipped', last_error: reasonCode(outcome.reason) })
            .execute();
          return;
      }
    },

    stats: async () => {
      // Each count reads a partial index (pending / dead), not the whole outbox.
      const row = await db
        .selectNoFrom([
          sql<number>`(SELECT count(*) FROM notify.email_outbox WHERE status = 'pending')::int`.as(
            'pending',
          ),
          sql<number>`(SELECT count(*) FROM notify.email_outbox
            WHERE status = 'pending' AND next_attempt_at <= now())::int`.as('due'),
          sql<number>`(SELECT count(*) FROM notify.email_outbox WHERE status = 'dead')::int`.as(
            'dead',
          ),
          sql<number>`coalesce((SELECT extract(epoch FROM now() - min(next_attempt_at))
            FROM notify.email_outbox
            WHERE status = 'pending' AND next_attempt_at <= now()), 0)::int`.as('oldest'),
        ])
        .executeTakeFirstOrThrow();
      return { pending: row.pending, due: row.due, dead: row.dead, oldestDueSeconds: row.oldest };
    },
  };
}
