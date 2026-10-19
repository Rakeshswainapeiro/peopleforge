import { Decimal } from 'decimal.js';
import type { SnapshotInput } from '@peopleforge/db';
import { periodEnd } from './validate.js';

/**
 * Per department figures of one subsidiary's month (R2-05, DASH-D5/D6), stored with each
 * accepted version so the dashboards add up rows instead of decrypting every salary on every
 * view (NFR-PERF-01, ADR-015). Amounts are decimal strings per currency.
 */

export const AGE_BANDS = ['under_25', '25_34', '35_44', '45_54', '55_plus', 'unknown'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export interface DepartmentMetrics {
  /** Not left at month end. */
  headcount: number;
  /** Joined during the month. */
  joiners: number;
  /** Left during the month. */
  leavers: number;
  female: number;
  male: number;
  otherGender: number;
  ageBands: Record<AgeBand, number>;
  /** Per grade: headcount and gross payroll per currency. */
  grades: Record<string, { headcount: number; payroll: Record<string, string> }>;
  /** Monthly gross payroll per currency (headcount only). */
  payroll: Record<string, string>;
}

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

const add = (sums: Record<string, string>, currency: string, amount: string) => {
  const map = new Map(Object.entries(sums));
  map.set(currency, new Decimal(map.get(currency) ?? '0').plus(amount).toFixed(2));
  return Object.fromEntries(map);
};

function emptyMetrics(): DepartmentMetrics {
  return {
    headcount: 0,
    joiners: 0,
    leavers: 0,
    female: 0,
    male: 0,
    otherGender: 0,
    ageBands: { under_25: 0, '25_34': 0, '35_44': 0, '45_54': 0, '55_plus': 0, unknown: 0 },
    grades: {},
    payroll: {},
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
    const grades = new Map(Object.entries(metrics.grades));
    const grade = grades.get(record.grade) ?? { headcount: 0, payroll: {} };
    grades.set(record.grade, {
      headcount: grade.headcount + 1,
      payroll: add(grade.payroll, record.currency, record.grossSalary),
    });
    metrics.grades = Object.fromEntries(grades);
    metrics.payroll = add(metrics.payroll, record.currency, record.grossSalary);
  }
  return [...byDepartment]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([department, metrics]) => ({ department, metrics }));
}
