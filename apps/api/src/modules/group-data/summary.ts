import { Decimal } from 'decimal.js';
import { AGE_BAND_KEYS, DecimalString } from '@peopleforge/contracts';
import type { SnapshotInput } from '@peopleforge/db';
import { z } from 'zod';
import { periodEnd } from './validate.js';

/**
 * Per department figures of one subsidiary's month (R2-05, DASH-D5/D6), stored with each
 * accepted version so the dashboards add up rows instead of decrypting every salary on every
 * view (NFR-PERF-01, ADR-015). Amounts are decimal strings per currency.
 */

export const AGE_BANDS = AGE_BAND_KEYS;
export type AgeBand = (typeof AGE_BANDS)[number];

const Count = z.number().int().min(0);

/**
 * What is stored per subsidiary, month and department (`groupdata.period_summary.metrics`),
 * read back through this schema: the database row is data, not trusted.
 */
export const DepartmentMetricsSchema = z.object({
  /** Not left at month end. */
  headcount: Count,
  /** Joined during the month. */
  joiners: Count,
  /** Left during the month. */
  leavers: Count,
  female: Count,
  male: Count,
  otherGender: Count,
  ageBands: z.object({
    under_25: Count,
    '25_34': Count,
    '35_44': Count,
    '45_54': Count,
    '55_plus': Count,
    unknown: Count,
  }),
  /** Monthly gross payroll and headcount per currency and grade (those not left). */
  pay: z.array(
    z.object({
      currency: z.string(),
      grade: z.string(),
      headcount: z.number().int().min(1),
      payroll: DecimalString,
    }),
  ),
});
export type DepartmentMetrics = z.infer<typeof DepartmentMetricsSchema>;

/** Whole years between a birth date and a day (both ISO dates). */
export function ageOn(birth: string, day: string): number {
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function ageBand(birth: string | null, day: string): AgeBand {
  if (birth === null) return 'unknown';
  const age = ageOn(birth, day);
  if (age < 25) return 'under_25';
  if (age < 35) return '25_34';
  if (age < 45) return '35_44';
  if (age < 55) return '45_54';
  return '55_plus';
}

function emptyMetrics(): DepartmentMetrics {
  return {
    headcount: 0,
    joiners: 0,
    leavers: 0,
    female: 0,
    male: 0,
    otherGender: 0,
    ageBands: { under_25: 0, '25_34': 0, '35_44': 0, '45_54': 0, '55_plus': 0, unknown: 0 },
    pay: [],
  };
}

/** The month's figures per department. */
export function summarise(
  records: readonly SnapshotInput[],
  period: string,
): { department: string; metrics: DepartmentMetrics }[] {
  const end = periodEnd(period);
  const start = `${period}-01`;
  const byDepartment = new Map<string, DepartmentMetrics>();
  for (const record of records) {
    const metrics = byDepartment.get(record.department) ?? emptyMetrics();
    byDepartment.set(record.department, metrics);
    if (record.dateJoined >= start && record.dateJoined <= end) metrics.joiners += 1;
    if (record.dateLeft !== null && record.dateLeft >= start && record.dateLeft <= end) {
      metrics.leavers += 1;
    }
    if (record.status === 'left') continue;
    metrics.headcount += 1;
    if (record.gender === 'female') metrics.female += 1;
    else if (record.gender === 'male') metrics.male += 1;
    else metrics.otherGender += 1;
    const band = ageBand(record.dateOfBirth, end);
    metrics.ageBands = Object.fromEntries(
      Object.entries(metrics.ageBands).map(([key, count]) => [
        key,
        key === band ? count + 1 : count,
      ]),
    ) as Record<AgeBand, number>;
    const cell = metrics.pay.find(
      (entry) => entry.currency === record.currency && entry.grade === record.grade,
    );
    if (cell === undefined) {
      metrics.pay.push({
        currency: record.currency,
        grade: record.grade,
        headcount: 1,
        payroll: new Decimal(record.grossSalary).toFixed(2),
      });
    } else {
      cell.headcount += 1;
      cell.payroll = new Decimal(cell.payroll).plus(record.grossSalary).toFixed(2);
    }
  }
  return [...byDepartment]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([department, metrics]) => ({
      department,
      metrics: {
        ...metrics,
        pay: metrics.pay.sort(
          (a, b) => a.currency.localeCompare(b.currency) || a.grade.localeCompare(b.grade),
        ),
      },
    }));
}
