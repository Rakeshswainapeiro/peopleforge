import type { GradeBandRecord } from '@peopleforge/db';
import { describe, expect, it } from 'vitest';
import { snapshot } from '../../test-support/group-data.js';
import {
  compareUpload,
  monthsBefore,
  percentChange,
  type CompareInput,
  type Rule,
  type RuleKind,
} from './compare.js';

// Prior-period verification (R2-09) and the anomaly rules ANM-01 … ANM-09 (R2-10), with worked
// examples for each threshold.

const RULES: Rule[] = (
  [
    ['ANM-01', 'missing_employee', null],
    ['ANM-02', 'grade_change', null],
    ['ANM-03', 'salary_change', '20'],
    ['ANM-04', 'salary_stable_then_changed', '12'],
    ['ANM-05', 'increment_mismatch', '1'],
    ['ANM-06', 'outside_grade_band', null],
    ['ANM-07', 'duplicate_across_entities', null],
    ['ANM-08', 'headcount_change', '10'],
    ['ANM-09', 'payroll_change', '10'],
  ] as const
).map(([code, kind, threshold]) => ({ code, kind, threshold, enabled: true }));

const BANDS: GradeBandRecord[] = [
  { grade: 'G5', minSalary: '12000.00', maxSalary: '16000.00', currency: 'AED' },
];

function input(overrides: Partial<CompareInput> = {}): CompareInput {
  return {
    period: '2026-09',
    records: [snapshot()],
    previous: { period: '2026-08', records: [snapshot()] },
    rules: RULES,
    gradeBands: BANDS,
    salaryHistory: [],
    approved: [],
    elsewhere: [],
    ...overrides,
  };
}

const only = (kind: RuleKind, threshold: string | null = null): Rule[] =>
  RULES.filter((rule) => rule.kind === kind).map((rule) => ({ ...rule, threshold }));

const raised = (result: ReturnType<typeof compareUpload>) =>
  result.flags.map((flag) => [flag.ruleCode, flag.employeeNumber, flag.field]);

describe('monthsBefore / percentChange', () => {
  it('steps back across years', () => {
    expect(monthsBefore('2026-01', 1)).toBe('2025-12');
    expect(monthsBefore('2026-09', 12)).toBe('2025-09');
  });

  it('gives one decimal, null from zero', () => {
    expect(percentChange('14200', '15620')).toBe('10.0');
    expect(percentChange('3', '2')).toBe('-33.3');
    expect(percentChange('0', '5')).toBeNull();
  });
});

describe('compareUpload [R2-09, R2-10]', () => {
  it('compares nothing for a first upload', () => {
    const result = compareUpload(input({ previous: null }));
    expect(result).toEqual({
      comparison: {
        previousPeriod: null,
        headcount: 1,
        previousHeadcount: null,
        payrollChangePercent: null,
        newRecords: 1,
        left: 0,
        missing: 0,
        changed: 0,
        warnings: [],
      },
      flags: [],
    });
  });

  it('counts new, left, missing and changed employees against the previous month', () => {
    const result = compareUpload(
      input({
        records: [
          snapshot({ department: 'Audit' }),
          snapshot({ employeeNumber: 'E2' }),
          snapshot({ employeeNumber: 'E3', status: 'left', dateLeft: '2026-09-10' }),
          snapshot({ employeeNumber: 'E5' }),
        ],
        previous: {
          period: '2026-08',
          records: [
            snapshot(),
            snapshot({ employeeNumber: 'E3' }),
            snapshot({ employeeNumber: 'E4' }),
            snapshot({ employeeNumber: 'E6', status: 'left', dateLeft: '2026-08-01' }),
            snapshot({ employeeNumber: 'E5' }),
          ],
        },
        rules: only('missing_employee'),
      }),
    );
    expect(result.comparison).toMatchObject({
      previousPeriod: '2026-08',
      headcount: 3,
      previousHeadcount: 4,
      newRecords: 1,
      left: 1,
      missing: 1,
      changed: 2,
    });
    expect(result.flags).toEqual([
      {
        ruleCode: 'ANM-01',
        employeeNumber: 'E4',
        employeeName: 'Aisha Rahman',
        field: 'employee_number',
        detail: { previousPeriod: '2026-08' },
      },
    ]);
  });

  it('flags grade changes and salary moves beyond the threshold (ANM-02, ANM-03)', () => {
    const result = compareUpload(
      input({
        records: [
          snapshot({ grade: 'G6', grossSalary: '17100.00' }),
          snapshot({ employeeNumber: 'E2', grossSalary: '17040.00' }),
        ],
        previous: {
          period: '2026-08',
          records: [snapshot(), snapshot({ employeeNumber: 'E2' })],
        },
        rules: [...only('grade_change'), ...only('salary_change', '20')],
      }),
    );
    // 14200 → 17100 is +20.4% (flagged); → 17040 is exactly +20.0% (not).
    expect(raised(result)).toEqual([
      ['ANM-02', 'EMP-1101', 'grade'],
      ['ANM-03', 'EMP-1101', 'gross_salary'],
    ]);
    expect(result.flags[1]?.detail).toEqual({
      previous: '14200.00',
      current: '17100.00',
      change: '20.4',
      threshold: '20',
    });
  });

  it('treats a rule without a threshold as "any change"', () => {
    const result = compareUpload(
      input({ records: [snapshot({ grossSalary: '14200.10' })], rules: only('salary_change') }),
    );
    expect(result.flags[0]?.detail.threshold).toBe('0');
    const zero = compareUpload(
      input({
        records: [snapshot({ grossSalary: '5' })],
        previous: { period: '2026-08', records: [snapshot({ grossSalary: '0' })] },
        rules: only('salary_change'),
      }),
    );
    expect(zero.flags).toEqual([]);
  });

  it('flags a salary that changed after being stable for N months (ANM-04)', () => {
    const history = (months: number, salary = '14200.00') =>
      Array.from({ length: months }, (_, index) => ({
        employeeNumber: 'EMP-1101',
        period: monthsBefore('2026-09', months - index),
        grossSalary: salary,
      }));
    const changed = [snapshot({ grossSalary: '14300.00' })];
    expect(
      raised(
        compareUpload(
          input({
            records: changed,
            rules: only('salary_stable_then_changed', '12'),
            salaryHistory: history(12),
          }),
        ),
      ),
    ).toEqual([['ANM-04', 'EMP-1101', 'gross_salary']]);
    // Default 12 months when the rule has no threshold.
    expect(
      compareUpload(
        input({
          records: changed,
          rules: only('salary_stable_then_changed'),
          salaryHistory: history(12),
        }),
      ).flags[0]?.detail.months,
    ).toBe('12');
    // No history, too short a history, a different earlier salary, or no change: no flag.
    expect(
      compareUpload(input({ records: changed, rules: only('salary_stable_then_changed', '1') }))
        .flags,
    ).toEqual([]);
    expect(
      compareUpload(
        input({
          records: changed,
          rules: only('salary_stable_then_changed', '12'),
          salaryHistory: history(11),
        }),
      ).flags,
    ).toEqual([]);
    expect(
      compareUpload(
        input({
          records: changed,
          rules: only('salary_stable_then_changed', '3'),
          salaryHistory: [...history(3, '14000.00'), ...history(1)],
        }),
      ).flags,
    ).toEqual([]);
    expect(
      compareUpload(
        input({ rules: only('salary_stable_then_changed', '12'), salaryHistory: history(12) }),
      ).flags,
    ).toEqual([]);
  });

  it('flags a new salary off the approved increment by more than the tolerance (ANM-05)', () => {
    const approved = [
      {
        employeeNumber: 'EMP-1101',
        currentSalary: '14200.00',
        newSalary: '14910.00',
        percent: '5.00',
      },
    ];
    const rules = only('increment_mismatch', '1');
    const at = (gross: string) =>
      compareUpload(input({ records: [snapshot({ grossSalary: gross })], rules, approved }));
    expect(at('14910.00').flags).toEqual([]);
    // 14,700 is 1.4% below 14,910.
    expect(at('14700.00').flags).toEqual([
      {
        ruleCode: 'ANM-05',
        employeeNumber: 'EMP-1101',
        employeeName: 'Aisha Rahman',
        field: 'gross_salary',
        detail: {
          previous: '14200.00',
          current: '14700.00',
          expected: '14910.00',
          approvedPercent: '5.00',
        },
      },
    ]);
    // Not yet applied (salary unchanged), or applied to another base: no flag.
    expect(at('14200.00').flags).toEqual([]);
    expect(
      compareUpload(
        input({
          records: [snapshot({ grossSalary: '15000.00' })],
          rules,
          approved: [{ ...approved[0], currentSalary: '13000.00' } as (typeof approved)[number]],
        }),
      ).flags,
    ).toEqual([]);
  });

  it('flags salaries outside the grade band in its currency (ANM-06)', () => {
    const result = compareUpload(
      input({
        previous: null,
        rules: only('outside_grade_band'),
        records: [
          snapshot({ employeeNumber: 'LOW', grossSalary: '11999.99' }),
          snapshot({ employeeNumber: 'HIGH', grossSalary: '16000.01' }),
          snapshot({ employeeNumber: 'EDGE', grossSalary: '16000.00' }),
          snapshot({ employeeNumber: 'USD', grossSalary: '1.00', currency: 'USD' }),
          snapshot({
            employeeNumber: 'LEFT',
            grossSalary: '1.00',
            status: 'left',
            dateLeft: '2026-09-01',
          }),
          snapshot({ employeeNumber: 'NOBAND', grossSalary: '1.00', grade: 'X9' }),
        ],
      }),
    );
    expect(raised(result)).toEqual([
      ['ANM-06', 'LOW', 'gross_salary'],
      ['ANM-06', 'HIGH', 'gross_salary'],
    ]);
    expect(result.flags[0]?.detail).toEqual({
      current: '11999.99',
      min: '12000.00',
      max: '16000.00',
      grade: 'G5',
    });
  });

  it('flags employee IDs in use in another subsidiary (ANM-07)', () => {
    const result = compareUpload(
      input({ rules: only('duplicate_across_entities'), elsewhere: ['EMP-1101', 'NOT-HERE'] }),
    );
    expect(raised(result)).toEqual([['ANM-07', 'EMP-1101', 'employee_number']]);
  });

  it('warns and flags headcount and payroll moves beyond the threshold (ANM-08, ANM-09)', () => {
    const many = (count: number, gross = '10000.00') =>
      Array.from({ length: count }, (_, index) =>
        snapshot({ employeeNumber: `E${String(index)}`, grossSalary: gross }),
      );
    const result = compareUpload(
      input({
        records: many(12),
        previous: { period: '2026-08', records: many(10) },
        rules: [...only('headcount_change', '10'), ...only('payroll_change', '10')],
      }),
    );
    expect(result.comparison.warnings).toEqual(['headcount_change', 'payroll_change']);
    expect(result.comparison.payrollChangePercent).toBe('20.0');
    expect(result.flags.map((flag) => [flag.ruleCode, flag.employeeNumber, flag.detail])).toEqual([
      ['ANM-08', null, { previous: '10', current: '12', change: '20.0', threshold: '10' }],
      ['ANM-09', null, { change: '20.0', threshold: '10' }],
    ]);
    // Exactly 10%: no warning.
    expect(
      compareUpload(
        input({
          records: many(11),
          previous: { period: '2026-08', records: many(10) },
          rules: [...only('headcount_change', '10'), ...only('payroll_change', '10')],
        }),
      ).comparison.warnings,
    ).toEqual([]);
  });

  it('applies no disabled rule', () => {
    const result = compareUpload(
      input({
        records: [snapshot({ grade: 'G9', grossSalary: '99999.00' })],
        previous: {
          period: '2026-08',
          records: [snapshot(), snapshot({ employeeNumber: 'GONE' })],
        },
        rules: RULES.map((rule) => ({ ...rule, enabled: false })),
        elsewhere: ['EMP-1101'],
      }),
    );
    expect(result.flags).toEqual([]);
    expect(result.comparison).toMatchObject({ missing: 1, warnings: [] });
  });

  it('compares payroll per currency and reports the largest move', () => {
    const result = compareUpload(
      input({
        records: [
          snapshot({ employeeNumber: 'A1', grossSalary: '10500.00' }),
          snapshot({ employeeNumber: 'U1', currency: 'USD', grossSalary: '1100.00' }),
        ],
        previous: {
          period: '2026-08',
          records: [
            snapshot({ employeeNumber: 'A1', grossSalary: '10000.00' }),
            snapshot({ employeeNumber: 'U1', currency: 'USD', grossSalary: '1000.00' }),
            snapshot({ employeeNumber: 'E1', currency: 'EUR', grossSalary: '0.00' }),
          ],
        },
        rules: [],
      }),
    );
    // AED +5%, USD +10%, EUR from zero (no percentage): USD's move is reported.
    expect(result.comparison.payrollChangePercent).toBe('10.0');
    const gone = compareUpload(
      input({
        records: [snapshot({ employeeNumber: 'A1', grossSalary: '10000.00' })],
        previous: {
          period: '2026-08',
          records: [
            snapshot({ employeeNumber: 'U1', currency: 'USD', grossSalary: '1000.00' }),
            snapshot({ employeeNumber: 'A1', grossSalary: '10000.00' }),
          ],
        },
        rules: [],
      }),
    );
    expect(gone.comparison.payrollChangePercent).toBe('-100.0');
  });
});
