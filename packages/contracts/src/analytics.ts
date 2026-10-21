import { z } from 'zod';
import { RequestStatusSchema } from './increment-requests.js';
import { LocaleSchema } from '@sirius/shared-types';

/**
 * Turnaround time (R1-11, DASH-D3) and back-and-forth (R1-12, DASH-D4) for Sirius HR, by
 * period and subsidiary, and RP-02 (their Excel report). Durations are elapsed days with one
 * decimal (ADR-006): 1.5 = a day and a half. No pay, no names of employees.
 */

export const AnalyticsQuerySchema = z.strictObject({
  cycleId: z.uuid().optional(),
  entityId: z.uuid().optional(),
  /** A criterion's code (DASH-D3 "Criterion" filter): narrows criterion TAT and the trend. */
  criterion: z
    .string()
    .regex(/^C[0-9]{1,2}$/u)
    .optional(),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

/** GET /reports/tat-back-and-forth: RP-02 as Excel. */
export const TatReportQuerySchema = AnalyticsQuerySchema.extend({
  format: z.literal('xlsx'),
  locale: LocaleSchema.default('en'),
});
export type TatReportQuery = z.infer<typeof TatReportQuerySchema>;

/** Days, one decimal, as a string (e.g. "2.5"); null when there is nothing to measure. */
const Days = z.string().regex(/^\d+\.\d$/u);

const RequestTatSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  entityCode: z.string(),
  status: RequestStatusSchema,
  employees: z.number().int().min(0),
  submittedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
  /** Submission to decision, or to now while open. */
  days: Days,
  open: z.boolean(),
});

const CriterionTatSchema = z.object({
  code: z.string(),
  /** Criteria verified (employee × criterion). */
  verified: z.number().int().min(0),
  /** From waiting (submission or resubmission) to verification. */
  averageDays: Days.nullable(),
  medianDays: Days.nullable(),
  maxDays: Days.nullable(),
});

/** One month of the TAT trend (DASH-D3), in the business time zone. */
const TatMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  /** Requests decided (or, with a criterion, verifications) in the month. */
  count: z.number().int().min(0),
  averageDays: Days.nullable(),
  medianDays: Days.nullable(),
});

const EntityTatSchema = z.object({
  entityCode: z.string(),
  requests: z.number().int().min(0),
  decided: z.number().int().min(0),
  averageDays: Days.nullable(),
  /** Open requests' current age. */
  openAverageDays: Days.nullable(),
});

const RequestBackAndForthSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  entityCode: z.string(),
  status: RequestStatusSchema,
  /** Employees returned (each return counts). */
  returns: z.number().int().min(0),
  /** Returns still with the subsidiary. */
  openReturns: z.number().int().min(0),
  /** Time employees spent returned to the subsidiary, summed. */
  daysWithSubsidiary: Days,
  questions: z.number().int().min(0),
  answers: z.number().int().min(0),
  /** Average time from a question to its answer; null with none answered. */
  averageAnswerDays: Days.nullable(),
});

const EntityBackAndForthSchema = z.object({
  entityCode: z.string(),
  requests: z.number().int().min(0),
  returns: z.number().int().min(0),
  averageReturnDays: Days.nullable(),
  questions: z.number().int().min(0),
  averageAnswerDays: Days.nullable(),
});

export const IncrementAnalyticsSchema = z.object({
  generatedAt: z.iso.datetime(),
  tat: z.object({
    requests: z.number().int().min(0),
    decided: z.number().int().min(0),
    averageDays: Days.nullable(),
    medianDays: Days.nullable(),
    open: z.number().int().min(0),
    openAverageDays: Days.nullable(),
    longestOpen: RequestTatSchema.nullable(),
    byCriterion: z.array(CriterionTatSchema),
    /**
     * The 12 months up to now: decided requests' TAT by decision month, or with a criterion
     * filter, that criterion's TAT by verification month.
     */
    trend: z.array(TatMonthSchema),
    /** Every criterion code met in the facts, for the filter (before filtering). */
    criteria: z.array(z.string()),
    byEntity: z.array(EntityTatSchema),
    /** Longest first. */
    byRequest: z.array(RequestTatSchema),
  }),
  backAndForth: z.object({
    returns: z.number().int().min(0),
    openReturns: z.number().int().min(0),
    averageReturnDays: Days.nullable(),
    questions: z.number().int().min(0),
    averageAnswerDays: Days.nullable(),
    byEntity: z.array(EntityBackAndForthSchema),
    /** Requests with any return or question, most time with the subsidiary first. */
    byRequest: z.array(RequestBackAndForthSchema),
  }),
});
export type IncrementAnalytics = z.infer<typeof IncrementAnalyticsSchema>;
