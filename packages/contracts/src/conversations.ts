import { z } from 'zod';
import { MAX_COMMENT_LENGTH, PAGE_SIZES } from './increment-requests.js';

/**
 * Questions and answers per employee between Sirius HR and the subsidiary (R1-08). The text is
 * personal data: it travels to the people on the request only and is stored encrypted.
 */

export const MessageSideSchema = z.enum(['sirius', 'subsidiary']);
export type MessageSide = z.infer<typeof MessageSideSchema>;

/** POST …/{id}/lines/{lineId}/messages (with an Idempotency-Key header). */
export const PostMessageSchema = z.strictObject({
  body: z
    .string()
    .trim()
    .min(1)
    .max(MAX_COMMENT_LENGTH)
    .transform((text) => text.normalize('NFC')),
});
export type PostMessage = z.infer<typeof PostMessageSchema>;

export const MessageSchema = z.object({
  id: z.uuid(),
  side: MessageSideSchema,
  authorName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

/** Threads waiting for the caller's answer, or every thread they can see. */
export const ConversationFilterSchema = z.enum(['awaiting', 'all']);
export type ConversationFilter = z.infer<typeof ConversationFilterSchema>;

/** GET /conversations. */
export const ConversationQuerySchema = z.strictObject({
  filter: ConversationFilterSchema.default('awaiting'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), 'page_size')
    .default(10),
});
export type ConversationQuery = z.infer<typeof ConversationQuerySchema>;

/** One employee's thread in the Conversations list, with its latest message. */
export const ThreadSchema = z.object({
  lineId: z.uuid(),
  request: z.object({ id: z.uuid(), reference: z.string(), entityCode: z.string() }),
  employeeNumber: z.string(),
  fullName: z.string(),
  messages: z.number().int().min(1),
  /** True when the latest message is from the other side: the caller has to answer. */
  awaitingMe: z.boolean(),
  last: z.object({
    side: MessageSideSchema,
    authorName: z.string(),
    createdAt: z.iso.datetime(),
    preview: z.string(),
  }),
});
export type Thread = z.infer<typeof ThreadSchema>;

export const ConversationPageSchema = z.object({
  items: z.array(ThreadSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  counts: z.object({ all: z.number().int().min(0), awaiting: z.number().int().min(0) }),
});
export type ConversationPage = z.infer<typeof ConversationPageSchema>;
