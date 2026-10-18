import { z } from 'zod';

/**
 * In-app notifications (R1-07, R1-13). The API stores what happened (`kind`) and display
 * values (`params`); each client words it in the reader's language.
 */
export const NotificationKindSchema = z.enum([
  /** To the submitter: their request went to Sirius HR. */
  'request_submitted',
  /** To Sirius HR reviewers: a new request to review. */
  'request_received',
  /** To the submitter: Sirius HR verified a criterion for everyone; the next is under review. */
  'stage_changed',
  /** To the submitter: one employee approved, or rejected, by Sirius HR (R1-09). */
  'employee_approved',
  'employee_rejected',
  /** To the submitter, action needed: an employee is back with a question (R1-08). */
  'employee_returned',
  /** To the submitter: every employee is decided; the request has its final status. */
  'request_decided',
  /** To Sirius HR reviewers: returned employees came back, fixed. */
  'request_resubmitted',
  /** To the submitter, action needed: Sirius HR asked a question about an employee (R1-08). */
  'question_asked',
  /** To Sirius HR reviewers, action needed: the subsidiary answered. */
  'question_answered',
  /** Reminders on configured triggers (R1-13, settings): see `ReminderKindSchema`. */
  'review_overdue',
  'return_overdue',
  'deadline_approaching',
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationFilterSchema = z.enum(['all', 'unread', 'action_needed']);
export type NotificationFilter = z.infer<typeof NotificationFilterSchema>;

export const NotificationSchema = z.object({
  id: z.uuid(),
  kind: NotificationKindSchema,
  requestId: z.uuid().nullable(),
  /** Display values, e.g. { reference, employees, actor }. Never pay or justifications. */
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  actionNeeded: z.boolean(),
  createdAt: z.iso.datetime(),
  read: z.boolean(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  unread: z.number().int().min(0),
});
export type NotificationPage = z.infer<typeof NotificationPageSchema>;

export const NotificationQuerySchema = z.strictObject({
  filter: NotificationFilterSchema.default('all'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** The sidebar bell. */
export const NotificationSummarySchema = z.object({ unread: z.number().int().min(0) });
export type NotificationSummary = z.infer<typeof NotificationSummarySchema>;

/** POST /notifications/read: the given ones, or all of the caller's when `ids` is left out. */
export const MarkNotificationsReadSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(100).optional(),
});
export type MarkNotificationsRead = z.infer<typeof MarkNotificationsReadSchema>;
