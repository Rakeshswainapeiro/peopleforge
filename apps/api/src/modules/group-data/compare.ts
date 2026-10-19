import { Decimal } from 'decimal.js';
import type { UploadComparison } from '@peopleforge/contracts';
import type { FlagInput, GradeBandRecord, SnapshotInput } from '@peopleforge/db';

/**
 * Verification against the previous period (R2-09) and the anomaly rules (R2-10, ADR-015): a
 * pure function of an upload's records, the subsidiary's previous month and the configured
 * rules, so every rule is tested with worked examples. Flags carry display values only.
 */

export type RuleKind =
  | 'missing_employee'
  | 'grade_change'
  | 'salary_change'
  | 'salary_stable_then_changed'
  | 'increment_mismatch'
  | 'outside_grade_band'
  | 'duplicate_across_entities'
  | 'headcount_change'
  | 'payroll_change';

export interface Rule {
  code: string;
  kind: RuleKind;
  /** Percent (changes, tolerance) or months (ANM-04); null when the rule has none. */
  threshold: string | null;
  enabled: boolean;
}

/** An increment approved in the Increment Portal (R1), for ANM-05. */
export interface ApprovedIncrement {
  employeeNumber: string;
  /** The salary the request was made on, and the salary it gives. */
  currentSalary: string;
  newSalary: string;
  percent: string;
}

export interface CompareInput {
  period: string;
  records: readonly SnapshotInput[];
  /** The previous month in use, with its records; null for a subsidiary's first upload. */
  previous: { period: string; records: readonly SnapshotInput[] } | null;
  rules: readonly Rule[];
  gradeBands: readonly GradeBandRecord[];
  /** Gross salaries in use per employee over the months before `period` (ANM-04). */
  salaryHistory: readonly { employeeNumber: string; period: string; grossSalary: string }[];
  approved: readonly ApprovedIncrement[];
  /** Employee IDs of this upload also in use in another subsidiary this month (ANM-07). */
  elsewhere: readonly string[];
}

/** The values compared between months (row number and extras aside). */
const COMPARED: readonly ((record: SnapshotInput) => string | null)[] = [
  (record) => record.fullName,
  (record) => record.department,
  (record) => record.designation,
  (record) => record.grade,
  (record) => record.grossSalary,
  (record) => record.basicSalary,
  (record) => record.currency,
  (record) => record.dateJoined,
  (record) => record.dateOfBirth,
  (record) => record.gender,
  (record) => record.nationality,
  (record) => record.status,
  (record) => record.dateLeft,
  (record) => record.costCentre,
];

/** "2026-09" minus `months`. */
export function monthsBefore(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 - months, 1));
  return date.toISOString().slice(0, 7);
}

/** A percent change: exact for the rules, one decimal for display. */
interface Change {
  exact: Decimal;
  shown: string;
}

function changeOf(before: Decimal.Value, after: Decimal.Value): Change | null {
  const base = new Decimal(before);
  if (base.isZero()) return null;
  const exact = new Decimal(after).minus(base).dividedBy(base).times(100);
  return { exact, shown: exact.toFixed(1) };
}

/** Percent change from `before` to `after`, one decimal; null when `before` is zero. */
export function percentChange(before: string, after: string): string | null {
  return changeOf(before, after)?.shown ?? null;
}

/** A rule's threshold; a rule saved without one flags any change. */
const limit = (rule: Rule) => rule.threshold ?? '0';

/** Whether a change is beyond the rule's threshold (exact, not the rounded display). */
function exceeds(change: Change | null, rule: Rule): change is Change {
  return change?.exact.abs().greaterThan(limit(rule)) === true;
}

/** Monthly gross of those not left, per currency (amounts in different currencies never add). */
function payrolls(records: readonly SnapshotInput[]): Map<string, Decimal> {
  const sums = new Map<string, Decimal>();
  for (const record of records) {
    if (record.status === 'left') continue;
    sums.set(
      record.currency,
      (sums.get(record.currency) ?? new Decimal(0)).plus(record.grossSalary),
    );
  }
  return sums;
}

/** The largest payroll change of any currency paid in the previous month. */
function payrollChange(
  before: readonly SnapshotInput[],
  after: readonly SnapshotInput[],
): Change | null {
  const now = payrolls(after);
  let largest: Change | null = null;
  for (const [currency, total] of payrolls(before)) {
    const change = changeOf(total, now.get(currency) ?? 0);
    if (
      change !== null &&
      (largest === null || change.exact.abs().greaterThan(largest.exact.abs()))
    ) {
      largest = change;
    }
  }
  return largest;
}

const headcount = (records: readonly SnapshotInput[]) =>
  records.filter((record) => record.status !== 'left').length;

function flag(
  rule: Rule,
  record: Pick<SnapshotInput, 'employeeNumber' | 'fullName'> | null,
  field: string | null,
  detail: Record<string, string>,
): FlagInput {
  return {
    ruleCode: rule.code,
    employeeNumber: record?.employeeNumber ?? null,
    employeeName: record?.fullName ?? null,
    field,
    detail,
  };
}

/** The comparison shown on the upload and dashboard, and the flags the rules raise. */
export function compareUpload(input: CompareInput): {
  comparison: UploadComparison;
  flags: FlagInput[];
} {
  const rules = new Map(
    input.rules.filter((rule) => rule.enabled).map((rule) => [rule.kind, rule] as const),
  );
  const flags: FlagInput[] = [];
  const previous = new Map(
    (input.previous?.records ?? []).map((record) => [record.employeeNumber, record]),
  );
  const current = new Map(input.records.map((record) => [record.employeeNumber, record]));
  const bands = new Map(input.gradeBands.map((band) => [band.grade, band]));
  const approved = new Map(
    input.approved.map((increment) => [increment.employeeNumber, increment]),
  );
  const history = new Map<string, string[]>();
  for (const entry of input.salaryHistory) {
    history.set(entry.employeeNumber, [
      ...(history.get(entry.employeeNumber) ?? []),
      entry.grossSalary,
    ]);
  }

  let changed = 0;
  for (const record of input.records) {
    const before = previous.get(record.employeeNumber);
    if (before !== undefined && COMPARED.some((value) => value(before) !== value(record)))
      changed += 1;
    const gradeRule = rules.get('grade_change');
    if (gradeRule && before !== undefined && before.grade !== record.grade) {
      flags.push(
        flag(gradeRule, record, 'grade', { previous: before.grade, current: record.grade }),
      );
    }
    const change = before === undefined ? null : changeOf(before.grossSalary, record.grossSalary);
    const salaryRule = rules.get('salary_change');
    if (salaryRule && before !== undefined && exceeds(change, salaryRule)) {
      flags.push(
        flag(salaryRule, record, 'gross_salary', {
          previous: before.grossSalary,
          current: record.grossSalary,
          change: change.shown,
          threshold: limit(salaryRule),
        }),
      );
    }
    const stableRule = rules.get('salary_stable_then_changed');
    if (stableRule && before !== undefined && before.grossSalary !== record.grossSalary) {
      // Months unchanged before the change (a rule without a threshold means a year).
      const months = Number(stableRule.threshold ?? '12');
      const past = history.get(record.employeeNumber) ?? [];
      if (
        past.length >= months &&
        past.slice(-months).every((value) => value === before.grossSalary)
      ) {
        flags.push(
          flag(stableRule, record, 'gross_salary', {
            previous: before.grossSalary,
            current: record.grossSalary,
            months: String(months),
          }),
        );
      }
    }
    const incrementRule = rules.get('increment_mismatch');
    const increment = approved.get(record.employeeNumber);
    if (
      incrementRule &&
      before !== undefined &&
      increment?.currentSalary === before.grossSalary &&
      record.grossSalary !== before.grossSalary
    ) {
      const off = changeOf(increment.newSalary, record.grossSalary);
      if (exceeds(off, incrementRule)) {
        flags.push(
          flag(incrementRule, record, 'gross_salary', {
            previous: before.grossSalary,
            current: record.grossSalary,
            expected: increment.newSalary,
            approvedPercent: increment.percent,
          }),
        );
      }
    }
    const bandRule = rules.get('outside_grade_band');
    const band = bands.get(record.grade);
    if (
      bandRule &&
      band?.currency === record.currency &&
      record.status !== 'left' &&
      (new Decimal(record.grossSalary).lessThan(band.minSalary) ||
        new Decimal(record.grossSalary).greaterThan(band.maxSalary))
    ) {
      flags.push(
        flag(bandRule, record, 'gross_salary', {
          current: record.grossSalary,
          min: band.minSalary,
          max: band.maxSalary,
          grade: record.grade,
        }),
      );
    }
  }

  const duplicateRule = rules.get('duplicate_across_entities');
  if (duplicateRule) {
    for (const number of input.elsewhere) {
      const record = current.get(number);
      if (record !== undefined) {
        flags.push(flag(duplicateRule, record, 'employee_number', { current: number }));
      }
    }
  }

  let missing = 0;
  const missingRule = rules.get('missing_employee');
  const prior = input.previous;
  for (const before of prior?.records ?? []) {
    if (prior === null || before.status === 'left' || current.has(before.employeeNumber)) continue;
    missing += 1;
    if (missingRule) {
      flags.push(flag(missingRule, before, 'employee_number', { previousPeriod: prior.period }));
    }
  }

  const count = headcount(input.records);
  const previousCount = input.previous === null ? null : headcount(input.previous.records);
  const payroll =
    input.previous === null ? null : payrollChange(input.previous.records, input.records);
  const headcountChange = previousCount === null ? null : changeOf(previousCount, count);
  const warnings: UploadComparison['warnings'] = [];
  const headcountRule = rules.get('headcount_change');
  if (headcountRule && exceeds(headcountChange, headcountRule)) {
    warnings.push('headcount_change');
    flags.push(
      flag(headcountRule, null, null, {
        previous: String(previousCount),
        current: String(count),
        change: headcountChange.shown,
        threshold: limit(headcountRule),
      }),
    );
  }
  const payrollRule = rules.get('payroll_change');
  if (payrollRule && exceeds(payroll, payrollRule)) {
    warnings.push('payroll_change');
    flags.push(
      flag(payrollRule, null, null, {
        change: payroll.shown,
        threshold: limit(payrollRule),
      }),
    );
  }

  return {
    comparison: {
      previousPeriod: input.previous?.period ?? null,
      headcount: count,
      previousHeadcount: previousCount,
      payrollChangePercent: payroll?.shown ?? null,
      newRecords: input.records.filter((record) => !previous.has(record.employeeNumber)).length,
      left: input.records.filter((record) => record.status === 'left').length,
      missing,
      changed,
      warnings,
    },
    flags,
  };
}
