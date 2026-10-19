import { z } from 'zod';
import { PeriodSchema, UploadComparisonSchema } from './group-data.js';
import { PAGE_SIZES } from './increment-requests.js';

/**
 * Data quality (R2-09 … R2-11, DASH-D7): the anomaly rules (configuration, NFR-CFG-01), the
 * flags they raise on accepted uploads, and how a flag is owned, progressed and resolved.
 */

export const RULE_KINDS = [
  'missing_employee',
  'grade_change',
  'salary_change',
  'salary_stable_then_changed',
  'increment_mismatch',
  'outside_grade_band',
  'duplicate_across_entities',
  'headcount_change',
  'payroll_change',
] as const;
export const RuleKindSchema = z.enum(RULE_KINDS);
export type RuleKind = z.infer<typeof RuleKindSchema>;

/** What a rule's threshold means, for the settings screen. */
export const RULE_THRESHOLD_UNIT = new Map<RuleKind, 'percent' | 'months' | null>([
  ['missing_employee', null],
  ['grade_change', null],
  ['salary_change', 'percent'],
  ['salary_stable_then_changed', 'months'],
  ['increment_mismatch', 'percent'],
  ['outside_grade_band', null],
  ['duplicate_across_entities', null],
  ['headcount_change', 'percent'],
  ['payroll_change', 'percent'],
]);

export const AnomalyRuleSchema = z.object({
  /** "ANM-03". */
  code: z.string(),
  kind: RuleKindSchema,
  /** Decimal string; null for rules without one. */
  threshold: z.string().nullable(),
  enabled: z.boolean(),
  updatedAt: z.iso.datetime(),
  updatedByName: z.string().nullable(),
});
export type AnomalyRule = z.infer<typeof AnomalyRuleSchema>;

export const RuleCodeSchema = z.string().regex(/^ANM-\d{2}$/u, 'rule');

/** PUT /settings/anomaly-rules/:code (admins). */
export const UpdateRuleSchema = z.strictObject({
  /** 0 – 999 with at most 2 decimals; null clears it (the rule then flags any change). */
  threshold: z
    .string()
    .trim()
    .regex(/^\d{1,3}$|^\d{1,3}\.\d{1,2}$/u, 'threshold')
    // Above zero (the database's CHECK): a rule that flags any change has no threshold.
    .refine((value) => /[1-9]/u.test(value), 'threshold')
    .nullable(),
  enabled: z.boolean(),
});
export type UpdateRule = z.infer<typeof UpdateRuleSchema>;

export const FLAG_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export const FlagStatusSchema = z.enum(FLAG_STATUSES);
export type FlagStatus = z.infer<typeof FlagStatusSchema>;

export const FlagCountsSchema = z.object({
  open: z.number().int().min(0),
  in_progress: z.number().int().min(0),
  resolved: z.number().int().min(0),
});
export type FlagCounts = z.infer<typeof FlagCountsSchema>;

export const FlagSchema = z.object({
  id: z.uuid(),
  /** "AN-0042". */
  reference: z.string(),
  entity: z.object({ id: z.uuid(), code: z.string() }),
  period: PeriodSchema,
  upload: z.object({ id: z.uuid(), reference: z.string() }),
  ruleCode: z.string(),
  ruleKind: RuleKindSchema,
  employeeNumber: z.string().nullable(),
  employeeName: z.string().nullable(),
  field: z.string().nullable(),
  /** Display values (previous, current, expected, threshold…); empty without pay access. */
  detail: z.record(z.string(), z.string()),
  owner: z.object({ id: z.string(), name: z.string() }),
  status: FlagStatusSchema,
  note: z.string().nullable(),
  /** "superseded" when a newer version of the data closed it. */
  resolvedReason: z.literal('superseded').nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const FlagQuerySchema = z.strictObject({
  period: PeriodSchema.optional(),
  entityId: z.uuid().optional(),
  status: FlagStatusSchema.optional(),
  rule: RuleCodeSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), 'page_size')
    .default(PAGE_SIZES[0]),
});
export type FlagQuery = z.infer<typeof FlagQuerySchema>;

export const FlagPageSchema = z.object({
  items: z.array(FlagSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  counts: FlagCountsSchema,
  oldestOpenAt: z.iso.datetime().nullable(),
  /** The rules, for the rule filter (configuration, R2-10). */
  rules: z.array(z.object({ code: z.string(), kind: RuleKindSchema })),
  byEntity: z.array(
    z.object({ entity: z.object({ id: z.uuid(), code: z.string() }), counts: FlagCountsSchema }),
  ),
  /** Each subsidiary's version in use for the period and how it compares (R2-09). */
  variations: z.array(
    z.object({
      entity: z.object({ id: z.uuid(), code: z.string() }),
      upload: z.object({ id: z.uuid(), reference: z.string(), version: z.number().int().min(1) }),
      comparison: UploadComparisonSchema.nullable(),
      flags: z.number().int().min(0),
    }),
  ),
});
export type FlagPage = z.infer<typeof FlagPageSchema>;

export const FlagActivitySchema = z.object({
  action: z.string(),
  actorName: z.string().nullable(),
  at: z.iso.datetime(),
  /** Status moves and owner names only; never notes or values. */
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const FlagDetailSchema = z.object({
  flag: FlagSchema,
  activity: z.array(FlagActivitySchema),
  previousId: z.uuid().nullable(),
  nextId: z.uuid().nullable(),
  /** Who the flag can be assigned to. */
  owners: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type FlagDetail = z.infer<typeof FlagDetailSchema>;

export const MAX_FLAG_NOTE = 2000;

/** PATCH /group/flags/:id: owner, status and note; resolving needs a note (R2-11). */
export const UpdateFlagSchema = z
  .strictObject({
    ownerId: z.string().trim().min(1).max(200).nullable(),
    status: FlagStatusSchema,
    note: z
      .string()
      .trim()
      .max(MAX_FLAG_NOTE)
      .transform((value) => (value === '' ? null : value.normalize('NFC')))
      .nullable(),
  })
  .refine((input) => input.status !== 'resolved' || input.note !== null, {
    path: ['note'],
    message: 'note_required',
  });
export type UpdateFlag = z.infer<typeof UpdateFlagSchema>;
