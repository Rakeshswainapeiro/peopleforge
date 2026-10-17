import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { recordAudit } from './audit.js';
import { MESSAGE_BODY } from './encrypted-fields.js';
import type { FieldCipher } from './field-crypto.js';
import { RequestDataError } from './increment-requests.js';
import { insertNotifications, type NewNotification } from './notifications.js';
import { claimKey, IN_REVIEW, lockRequest } from './review.js';
import type { Database, MessageSide } from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Questions and answers per employee between Sirius HR and the subsidiary (R1-08): the
 * back-and-forth of a request, kept append-only with the text encrypted (ADR-008). A thread is
 * one employee's messages; whoever didn't write the last one has to answer.
 */

export interface MessageRecord {
  id: string;
  side: MessageSide;
  authorName: string;
  body: string;
  createdAt: Date;
}

/** What a message's notifications need to know (the API words them). */
export interface MessageContext {
  reference: string;
  entityId: string;
  requestId: string;
  lineId: string;
  employeeName: string;
  /** The subsidiary user who submitted the request: who hears Sirius HR's questions. */
  submittedBy: string | null;
}

export interface PostMessageInput {
  requestId: string;
  lineId: string;
  side: MessageSide;
  authorName: string;
  body: string;
  idempotencyKey: string;
  notifications: (context: MessageContext) => readonly NewNotification[];
}

export type ThreadFilter = 'awaiting' | 'all';

export interface ThreadQuery {
  /** The caller's side: "awaiting" lists threads whose last message is from the other side. */
  side: MessageSide;
  filter: ThreadFilter;
  limit: number;
  offset: number;
}

export interface ThreadRecord {
  lineId: string;
  request: { id: string; reference: string; entityCode: string };
  employeeNumber: string;
  fullName: string;
  messages: number;
  last: { side: MessageSide; authorName: string; createdAt: Date; preview: string };
}

export interface ConversationRepository {
  /** An employee's messages, oldest first. Row-Level Security limits it to the caller's. */
  thread: (scope: Scope, requestId: string, lineId: string) => Promise<MessageRecord[]>;
  /** Posts a message (idempotent per user and key); refused on a draft or a decided request. */
  post: (scope: Scope, input: PostMessageInput) => Promise<{ replayed: boolean }>;
  /** Threads the caller can see, latest first, with how many wait for the caller's answer. */
  threads: (
    scope: Scope,
    query: ThreadQuery,
  ) => Promise<{ items: ThreadRecord[]; total: number; counts: { all: number; awaiting: number } }>;
}

/** Characters of the last message shown in the list. */
export const PREVIEW_LENGTH = 160;

/** The start of a message for a list, cut at a whole character with an ellipsis. */
export function preview(body: string): string {
  // Whole characters as people see them (an emoji or a letter with its marks stays together).
  const characters = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
      body.replace(/\s+/gu, ' ').trim(),
    ),
    (part) => part.segment,
  );
  return characters.length <= PREVIEW_LENGTH
    ? characters.join('')
    : `${characters.slice(0, PREVIEW_LENGTH - 1).join('')}…`;
}

export function createConversationRepository(
  db: Kysely<Database>,
  cipher: FieldCipher,
): ConversationRepository {
  const decrypt = (row: { id: string; body: Buffer }) =>
    cipher.decrypt(row.body, { ...MESSAGE_BODY, rowId: row.id });

  return {
    thread: (scope, requestId, lineId) =>
      withScope(db, scope, async (trx) => {
        const rows = await trx
          .selectFrom('increments.line_message')
          .select(['id', 'side', 'author_name', 'body', 'created_at'])
          .where('request_id', '=', requestId)
          .where('line_id', '=', lineId)
          .orderBy('created_at')
          .orderBy('id')
          .execute();
        return rows.map((row) => ({
          id: row.id,
          side: row.side,
          authorName: row.author_name,
          body: decrypt(row),
          createdAt: row.created_at,
        }));
      }),

    post: (scope, input) =>
      withScope(db, scope, async (trx) => {
        if (await claimKey(trx, scope.userId, input.idempotencyKey, input.requestId)) {
          return { replayed: true };
        }
        const request = await lockRequest(trx, input.requestId);
        // Questions belong to the review: not before submission, not after the final decision.
        if (!IN_REVIEW.includes(request.status)) throw new RequestDataError('not_in_review');
        const line = await trx
          .selectFrom('increments.request_line')
          .select(['id', 'full_name'])
          .where('id', '=', input.lineId)
          .where('request_id', '=', request.id)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (line === undefined) throw new RequestDataError('line_not_found');
        const id = randomUUID();
        await trx
          .insertInto('increments.line_message')
          .values({
            id,
            line_id: line.id,
            entity_id: request.entity_id,
            request_id: request.id,
            side: input.side,
            author_id: scope.userId,
            author_name: input.authorName,
            body: cipher.encrypt(input.body, { ...MESSAGE_BODY, rowId: id }),
          })
          .execute();
        await recordAudit(trx, scope.userId, {
          action: 'message.posted',
          entityId: request.entity_id,
          subjectType: 'request_line',
          subjectId: line.id,
          // Never the text: the trail says that something was asked, not what.
          details: { requestId: request.id, messageId: id, side: input.side },
        });
        await insertNotifications(
          trx,
          input.notifications({
            reference: request.reference,
            entityId: request.entity_id,
            requestId: request.id,
            lineId: line.id,
            employeeName: line.full_name,
            submittedBy: request.submitted_by,
          }),
        );
        return { replayed: false };
      }),

    threads: (scope, query) =>
      withScope(db, scope, async (trx) => {
        // The latest message of each thread, and how many each has.
        const latest = trx
          .selectFrom('increments.line_message')
          .distinctOn('line_id')
          .select(['line_id', 'id', 'side', 'author_name', 'body', 'created_at'])
          .orderBy('line_id')
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
          .as('m');
        const awaiting = sql<boolean>`m.side <> ${query.side}`;
        const counts = await trx
          .selectFrom(latest)
          .select([
            sql<number>`count(*)::int`.as('all'),
            sql<number>`count(*) filter (where ${awaiting})::int`.as('awaiting'),
          ])
          .executeTakeFirstOrThrow();
        const rows = await trx
          .selectFrom(latest)
          .innerJoin('increments.request_line as l', 'l.id', 'm.line_id')
          .innerJoin('increments.increment_request as r', 'r.id', 'l.request_id')
          .innerJoin('core.entity as e', 'e.id', 'r.entity_id')
          .select([
            'm.line_id',
            'm.id',
            'm.side',
            'm.author_name',
            'm.body',
            'm.created_at',
            'r.id as request_id',
            'r.reference',
            'e.code as entity_code',
            'l.employee_number',
            'l.full_name',
            sql<number>`(select count(*)::int from increments.line_message c where c.line_id = m.line_id)`.as(
              'messages',
            ),
          ])
          .where(query.filter === 'awaiting' ? awaiting : sql<boolean>`true`)
          .orderBy('m.created_at', 'desc')
          .orderBy('m.line_id')
          .limit(query.limit)
          .offset(query.offset)
          .execute();
        return {
          total: query.filter === 'awaiting' ? counts.awaiting : counts.all,
          counts,
          items: rows.map((row) => ({
            lineId: row.line_id,
            request: { id: row.request_id, reference: row.reference, entityCode: row.entity_code },
            employeeNumber: row.employee_number,
            fullName: row.full_name,
            messages: row.messages,
            last: {
              side: row.side,
              authorName: row.author_name,
              createdAt: row.created_at,
              preview: preview(decrypt(row)),
            },
          })),
        };
      }),
  };
}
