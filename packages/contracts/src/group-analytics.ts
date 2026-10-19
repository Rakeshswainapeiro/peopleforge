import { z } from 'zod';
import { PeriodSchema } from './group-data.js';
import { DecimalString } from './increment-requests.js';

/**
 * Group dashboards (R2-05, R2-07): DASH-D5 Group overview, DASH-D6 Compensation trends and
 * DASH-D8 Executive / IHC view. Built from the per-department figures stored with each accepted
 * version (ADR-015): totals only, never one person's pay. Amounts are decimal strings per
 * currency (amounts in different currencies are never added); percentages have one decimal.
 */

const EntityRef = z.object({ id: z.uuid(), code: z.string() });
const Count = z.number().int().min(0);
const Percent = z.string().nullable();

/** Amounts per currency, e.g. `{ AED: "1250000.00" }`. */
export const MoneyByCurrencySchema = z.record(z.string(), DecimalString);
export type MoneyByCurrency = z.infer<typeof MoneyByCurrencySchema>;

export const AGE_BAND_KEYS = ['under_25', '25_34', '35_44', '45_54', '55_plus', 'unknown'] as const;
export const AgeBandSchema = z.enum(AGE_BAND_KEYS);
export type AgeBand = z.infer<typeof AgeBandSchema>;

export const GroupDashboardQuerySchema = z.strictObject({
  period: PeriodSchema,
  entityId: z.uuid().optional(),
  department: z.string().trim().min(1).max(80).optional(),
});
export type GroupDashboardQuery = z.infer<typeof GroupDashboardQuerySchema>;

/** DASH-D5 Group overview. */
export const GroupOverviewSchema = z.object({
  period: PeriodSchema,
  previousPeriod: PeriodSchema,
  entities: Count,
  entitiesWithData: Count,
  headcount: Count,
  previousHeadcount: Count.nullable(),
  joiners: Count,
  leavers: Count,
  /** Leavers in the month over the average headcount of the two months, in percent. */
  turnoverPercent: Percent,
  female: Count,
  femaleSharePercent: Percent,
  byEntity: z.array(
    z.object({ entity: EntityRef, headcount: Count, joiners: Count, leavers: Count }),
  ),
  byDepartment: z.array(z.object({ department: z.string(), headcount: Count })),
  gender: z.object({ female: Count, male: Count, other: Count }),
  ageBands: z.array(z.object({ band: AgeBandSchema, count: Count })),
  grades: z.array(z.object({ grade: z.string(), headcount: Count })),
  /** The 12 months up to `period`; null where no subsidiary had data. */
  trend: z.array(z.object({ period: PeriodSchema, headcount: Count.nullable() })),
  departments: z.array(z.string()),
});
export type GroupOverview = z.infer<typeof GroupOverviewSchema>;

export const INCREMENT_BUCKETS = ['under_3', '3_5', '5_8', '8_10', '10_plus'] as const;
export const IncrementBucketSchema = z.enum(INCREMENT_BUCKETS);
export type IncrementBucket = z.infer<typeof IncrementBucketSchema>;

/** DASH-D6 Compensation trends. */
export const CompensationSchema = z.object({
  period: PeriodSchema,
  previousPeriod: PeriodSchema,
  /** Per currency: monthly gross payroll, its change, headcount and average. */
  payroll: z.array(
    z.object({
      currency: z.string(),
      amount: DecimalString,
      previousAmount: DecimalString.nullable(),
      changePercent: Percent,
      headcount: Count,
      average: DecimalString,
    }),
  ),
  trend: z.array(z.object({ period: PeriodSchema, payroll: MoneyByCurrencySchema })),
  /** Average monthly gross per grade and currency, with the grade's band in that currency. */
  grades: z.array(
    z.object({
      grade: z.string(),
      currency: z.string(),
      headcount: Count,
      average: DecimalString,
      band: z.object({ min: DecimalString, max: DecimalString }).nullable(),
    }),
  ),
  /** Increments approved in the Increment Portal (R1) in the period's year. */
  increments: z.object({
    approved: Count,
    averagePercent: Percent,
    distribution: z.array(z.object({ bucket: IncrementBucketSchema, count: Count })),
    costImpact: z.array(
      z.object({
        entity: EntityRef,
        currency: z.string(),
        employees: Count,
        monthlyIncrease: DecimalString,
        annualIncrease: DecimalString,
      }),
    ),
  }),
  departments: z.array(z.string()),
});
export type Compensation = z.infer<typeof CompensationSchema>;

export const ExecutiveQuerySchema = z.strictObject({ period: PeriodSchema });
export type ExecutiveQuery = z.infer<typeof ExecutiveQuerySchema>;

/** DASH-D8 Executive / IHC view: group totals only, no names, no individual pay. */
export const ExecutiveViewSchema = z.object({
  period: PeriodSchema,
  previousPeriod: PeriodSchema,
  entities: Count,
  entitiesWithData: Count,
  headcount: Count,
  previousHeadcount: Count.nullable(),
  joiners: Count,
  leavers: Count,
  turnoverPercent: Percent,
  femaleSharePercent: Percent,
  payroll: z.array(
    z.object({
      currency: z.string(),
      amount: DecimalString,
      changePercent: Percent,
    }),
  ),
  byEntity: z.array(
    z.object({
      entity: EntityRef,
      headcount: Count,
      payroll: MoneyByCurrencySchema,
      openFlags: Count,
      /** No accepted upload for the month. */
      missing: z.boolean(),
    }),
  ),
  trend: z.array(z.object({ period: PeriodSchema, headcount: Count.nullable() })),
  openFlags: Count,
});
export type ExecutiveView = z.infer<typeof ExecutiveViewSchema>;
