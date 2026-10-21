import { LocaleSchema } from '@sirius/shared-types';
import { z } from 'zod';
import { PeriodSchema } from './group-data.js';

/**
 * Group HR reports (R2-06, R2-07): RP-03 Headcount & demographics, RP-04 Compensation &
 * increment summary and RP-05 Data quality & anomalies (monthly, Excel or PDF), RP-06 Quarterly
 * group HR review and RP-07 Annual HR report (PDF, Sirius only). Built from the same totals as
 * the dashboards: no individual pay.
 */

export const GROUP_REPORTS = ['rp-03', 'rp-04', 'rp-05', 'rp-06', 'rp-07'] as const;
export const GroupReportCodeSchema = z.enum(GROUP_REPORTS);
export type GroupReportCode = z.infer<typeof GroupReportCodeSchema>;

export type ReportCadence = 'month' | 'quarter' | 'year';

export interface GroupReportSpec {
  cadence: ReportCadence;
  formats: readonly ('xlsx' | 'pdf')[];
}

const MONTHLY: GroupReportSpec = { cadence: 'month', formats: ['xlsx', 'pdf'] };
const QUARTERLY: GroupReportSpec = { cadence: 'quarter', formats: ['pdf'] };
const ANNUAL: GroupReportSpec = { cadence: 'year', formats: ['pdf'] };

/** How each report is cut, and the formats it comes in. */
export const GROUP_REPORT_SPECS: Readonly<Record<GroupReportCode, GroupReportSpec>> = {
  'rp-03': MONTHLY,
  'rp-04': MONTHLY,
  'rp-05': MONTHLY,
  'rp-06': QUARTERLY,
  'rp-07': ANNUAL,
};

export const QuarterSchema = z.string().regex(/^(20\d{2})-Q[1-4]$/u, 'quarter');
export const YearSchema = z.string().regex(/^20\d{2}$/u, 'year');

/**
 * A report's cadence and formats, by code (no lookup by a variable key). Each case returns its
 * own constant: the production minifier merged `GROUP_REPORT_SPECS['rp-0x']` reads across cases,
 * giving RP-06 and RP-07 a monthly spec in the web bundle (caught by the E2E download test).
 */
export function groupReportSpec(code: GroupReportCode): GroupReportSpec {
  switch (code) {
    case 'rp-03':
    case 'rp-04':
    case 'rp-05':
      return MONTHLY;
    case 'rp-06':
      return QUARTERLY;
    case 'rp-07':
      return ANNUAL;
  }
}

/** The first and last month a report period covers: "2026-Q3" → 2026-07 … 2026-09. */
export function periodBounds(
  period: string,
  cadence: ReportCadence,
): { first: string; last: string } {
  if (cadence === 'month') return { first: period, last: period };
  const year = period.slice(0, 4);
  const firstMonth = cadence === 'quarter' ? (Number(period.slice(6)) - 1) * 3 + 1 : 1;
  const lastMonth = cadence === 'quarter' ? firstMonth + 2 : 12;
  const month = (value: number) => `${year}-${String(value).padStart(2, '0')}`;
  return { first: month(firstMonth), last: month(lastMonth) };
}

/** A report's period in its cadence: "2026-09", "2026-Q3" or "2026". */
export function reportPeriodSchema(cadence: ReportCadence): z.ZodString {
  return cadence === 'month' ? PeriodSchema : cadence === 'quarter' ? QuarterSchema : YearSchema;
}

/** The months a report period covers, oldest first: one, three or twelve. */
export function monthsOfPeriod(period: string, cadence: ReportCadence): string[] {
  if (cadence === 'month') return [period];
  const year = Number(period.slice(0, 4));
  const first = cadence === 'quarter' ? (Number(period.slice(6)) - 1) * 3 + 1 : 1;
  const count = cadence === 'quarter' ? 3 : 12;
  return Array.from(
    { length: count },
    (_, index) => `${String(year)}-${String(first + index).padStart(2, '0')}`,
  );
}

/** GET /reports/{rp-03…rp-07}: the period, format and language; a subsidiary for RP-03…05. */
export const GroupReportQuerySchema = z.strictObject({
  period: z.string().max(7),
  format: z.enum(['xlsx', 'pdf']),
  locale: LocaleSchema.default('en'),
  entityId: z.uuid().optional(),
});
export type GroupReportQuery = z.infer<typeof GroupReportQuerySchema>;
