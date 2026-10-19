import { describe, expect, it } from 'vitest';
import { snapshot } from '../../test-support/group-data.js';
import { ageBand, ageOn, DepartmentMetricsSchema, summarise } from './summary.js';

// Per department figures stored with each accepted version (R2-05, DASH-D5/D6, ADR-015).

describe('ageOn / ageBand', () => {
  it('counts whole years, the birthday itself included', () => {
    expect(ageOn('1990-09-30', '2026-09-30')).toBe(36);
    expect(ageOn('1990-10-01', '2026-09-30')).toBe(35);
    expect(ageOn('1990-09-30', '2026-08-31')).toBe(35);
  });

  it('bands ages, unknown without a birth date', () => {
    const on = '2026-09-30';
    expect(
      ['2002-01-01', '2001-09-30', '1991-09-30', '1981-09-30', '1971-09-30', null].map((birth) =>
        ageBand(birth, on),
      ),
    ).toEqual(['under_25', '25_34', '35_44', '45_54', '55_plus', 'unknown']);
  });
});

describe('summarise [R2-05]', () => {
  it('counts headcount, joiners, leavers, gender, age, grades and payroll per currency', () => {
    const records = [
      snapshot({ employeeNumber: 'E1', dateJoined: '2026-09-01' }),
      snapshot({ employeeNumber: 'E2', gender: 'male', grade: 'G6', grossSalary: '16800.50' }),
      snapshot({
        employeeNumber: 'E3',
        gender: 'other',
        currency: 'USD',
        grossSalary: '5000.00',
        dateOfBirth: null,
      }),
      snapshot({ employeeNumber: 'E4', status: 'left', dateLeft: '2026-09-15' }),
      snapshot({ employeeNumber: 'E5', status: 'left', dateLeft: '2026-08-31' }),
      snapshot({ employeeNumber: 'E6', department: 'Audit', dateJoined: '2026-10-01' }),
    ];
    const summary = summarise(records, '2026-09');
    expect(summary.map((row) => row.department)).toEqual(['Audit', 'Finance']);
    expect(summary[1]?.metrics).toEqual({
      headcount: 3,
      joiners: 1,
      leavers: 1,
      female: 1,
      male: 1,
      otherGender: 1,
      ageBands: { under_25: 0, '25_34': 0, '35_44': 2, '45_54': 0, '55_plus': 0, unknown: 1 },
      pay: [
        { currency: 'AED', grade: 'G5', headcount: 1, payroll: '14200.00' },
        { currency: 'AED', grade: 'G6', headcount: 1, payroll: '16800.50' },
        { currency: 'USD', grade: 'G5', headcount: 1, payroll: '5000.00' },
      ],
    });
    // Joined after the month: not a joiner of September.
    expect(summary[0]?.metrics).toMatchObject({ headcount: 1, joiners: 0 });
  });

  it('adds employees of the same currency and grade into one cell', () => {
    const [finance] = summarise(
      [snapshot({ employeeNumber: 'A' }), snapshot({ employeeNumber: 'B', grossSalary: '800.25' })],
      '2026-09',
    );
    expect(finance?.metrics.pay).toEqual([
      { currency: 'AED', grade: 'G5', headcount: 2, payroll: '15000.25' },
    ]);
    expect(DepartmentMetricsSchema.parse(finance?.metrics)).toEqual(finance?.metrics);
  });

  it('is empty for no records', () => {
    expect(summarise([], '2026-09')).toEqual([]);
  });
});
