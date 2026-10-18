import { z } from 'zod';
import { DashboardFilterSchema, PAGE_SIZES } from './increment-requests.js';
import { LocaleSchema } from '@sirius/shared-types';

/**
 * Reports and the audit trail (R1-14, R1-15). Reports are files built by the API in the
 * reader's language; every download is recorded in the audit trail.
 */

export const ReportFormatSchema = z.enum(['xlsx', 'pdf']);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

/** GET /reports/increment-requests: RP-01 with the dashboard's filters (R1-14). */
export const IncrementReportQuerySchema = DashboardFilterSchema.extend({
  format: ReportFormatSchema,
  locale: LocaleSchema.default('en'),
});
export type IncrementReportQuery = z.infer<typeof IncrementReportQuerySchema>;

/** Detail values an audit entry may carry: IDs, codes, counts; never pay or text. */
const DetailValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** One entry of the audit trail (R1-15). */
export const AuditEventSchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  /** The actor's user ID, and their name as recorded (null for entries before it was kept). */
  actor: z.string(),
  actorName: z.string().nullable(),
  action: z.string(),
  entityId: z.uuid().nullable(),
  subjectType: z.string(),
  subjectId: z.string(),
  details: z.record(z.string(), DetailValue),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** GET /audit: the whole trail, for `audit:read` (Sirius HR reviewers, admins). */
export const AuditTrailQuerySchema = z.strictObject({
  actor: z.string().trim().min(1).max(128).optional(),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((text) => (text === '' ? undefined : text)),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), 'page_size')
    .default(25),
});
export type AuditTrailQuery = z.infer<typeof AuditTrailQuerySchema>;

export const AuditTrailPageSchema = z.object({
  items: z.array(AuditEventSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
export type AuditTrailPage = z.infer<typeof AuditTrailPageSchema>;
