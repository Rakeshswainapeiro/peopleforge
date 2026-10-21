import { z } from 'zod';
import {
  CriterionSchema,
  EvidencePolicySchema,
  MAX_EVIDENCE_FILE_MB,
} from './increment-requests.js';
import { CriterionThresholdSchema } from './thresholds.js';

/**
 * The increment portal's settings (R1-05, R1-13, NFR-CFG-01): the eligibility criteria and the
 * reminder triggers are configuration, changed by admins (`criteria:configure`), never code.
 */

/** Reminders the worker sends on configured triggers (R1-13). */
export const ReminderKindSchema = z.enum([
  /** To Sirius HR reviewers: employees waiting for review longer than `days`. */
  'review_overdue',
  /** To the submitter: employees returned to them and not resubmitted within `days`. */
  'return_overdue',
  /** To whoever prepares a draft: the cycle's submission deadline is `days` away or less. */
  'deadline_approaching',
  /** To the subsidiary's HR users: last month's data not uploaded `days` after month end (R2-11). */
  'upload_due',
  /** To a flag's owner: an anomaly flag still open after `days` (R2-11). */
  'flag_open',
]);
export type ReminderKind = z.infer<typeof ReminderKindSchema>;

/** Most days a trigger may wait. */
export const MAX_REMINDER_DAYS = 30;

export const ReminderRuleSchema = z.object({
  kind: ReminderKindSchema,
  days: z.number().int().min(1).max(MAX_REMINDER_DAYS),
  enabled: z.boolean(),
  updatedAt: z.iso.datetime(),
  /** Who changed it last, by name; null for the migration's defaults. */
  updatedByName: z.string().nullable(),
});
export type ReminderRule = z.infer<typeof ReminderRuleSchema>;

/** PUT /settings/reminders/{kind}. */
export const UpdateReminderRuleSchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(MAX_REMINDER_DAYS),
  enabled: z.boolean(),
});
export type UpdateReminderRule = z.infer<typeof UpdateReminderRuleSchema>;

/** Most criteria a version may have (the database allows positions 1–10). */
export const MAX_CRITERIA = 10;

const MAX_NAME = 120;
const MAX_DESCRIPTION = 1000;

/** Display text: trimmed, NFC-normalised (Arabic compares and counts consistently). */
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((value) => value.normalize('NFC'));

/** English is required; Arabic is optional until translations are provided (CR). */
const localised = (max: number) =>
  z.strictObject({
    en: text(max),
    ar: z
      .string()
      .trim()
      .max(max)
      .optional()
      .transform((value) =>
        value === undefined || value === '' ? undefined : value.normalize('NFC'),
      ),
  });

/**
 * One criterion as an admin edits it (R1-05). An existing criterion keeps its code; a new one
 * has none and gets the next free code. The list's order is the criteria's order.
 */
export const CriterionSettingsInputSchema = z.strictObject({
  code: z
    .string()
    .regex(/^C[0-9]{1,2}$/u)
    .optional(),
  name: localised(MAX_NAME),
  description: localised(MAX_DESCRIPTION),
  justificationRequired: z.boolean(),
  evidencePolicy: EvidencePolicySchema,
  maxFileMb: z.coerce.number().int().min(1).max(MAX_EVIDENCE_FILE_MB),
  /** Optional: the criterion passes on a measured value (R1-05). */
  threshold: CriterionThresholdSchema.nullable().default(null),
});
export type CriterionSettingsInput = z.infer<typeof CriterionSettingsInputSchema>;

/**
 * PUT /settings/criteria: publishes a new version of the criteria. `version` is the active
 * version the admin edited (a newer one in between is a conflict). Requests already created keep
 * the version they pinned (R1-05).
 */
export const PublishCriteriaSchema = z.strictObject({
  version: z.number().int().min(1),
  /** At least one criterion, at most ten; adding and removing publishes a new version. */
  criteria: z
    .array(CriterionSettingsInputSchema)
    .min(1)
    .max(MAX_CRITERIA)
    .refine(
      (criteria) => {
        const codes = criteria.flatMap((criterion) => criterion.code ?? []);
        return new Set(codes).size === codes.length;
      },
      { message: 'duplicate_code' },
    ),
});
export type PublishCriteria = z.infer<typeof PublishCriteriaSchema>;

/** GET /settings/criteria: the active version. */
export const CriteriaSettingsSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  activatedAt: z.iso.datetime().nullable(),
  criteria: z.array(CriterionSchema),
});
export type CriteriaSettings = z.infer<typeof CriteriaSettingsSchema>;
