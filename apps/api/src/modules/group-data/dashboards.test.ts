import type { SummaryRow } from '@peopleforge/db';
import { describe, expect, it } from 'vitest';
import {
  compensation,
  executiveView,
  groupOverview,
  incrementBucket,
  parseRows,
  percentOf,
  trendMonths,
  type Figures,
} from './dashboards.js';
import type { DepartmentMetrics } from './summary.js';

// Group dashboards (R2-05, R2-07; DASH-D5, D6, D8) from stored per-department figures, with
// worked examples. Currencies are never added together.

const A = { id: 'a', code: 'SUB-A' };
const B = { id: 'b', code: 'SUB-B' };

function metrics(overrides: Partial<DepartmentMetrics> = {}): DepartmentMetrics {
  return {
    headcount: 0,
    joiners: 0,
    leavers: 0,
    female: 0,
    male: 0,
    otherGender: 0,
    ageBands: { under_25: 0, '25_34': 0, '35_44': 0, '45_54': 0, '55_plus': 0, unknown: 0 },
    pay: [],
    ...overrides,
  };
}

function row(
  entity: typeof A,
  period: string,
  department: string,
  values: Partial<DepartmentMetrics>,
): Figures {
  return { entity, period, department, metrics: metrics(values) };
}

// September: A has Finance (10 people, AED) and Sales (5, 2 USD + 3 AED); B has Finance (4).
// August: A Finance 8, B Finance 4.
const ROWS: Figures[] = [
  row(A, '2026-08', 'Finance', {
    headcount: 8,
    pay: [{ currency: 'AED', grade: 'G5', headcount: 8, payroll: '80000.00' }],
  }),
  row(B, '2026-08', 'Finance', {
    headcount: 4,
    pay: [{ currency: 'AED', grade: 'G4', headcount: 4, payroll: '40000.00' }],
  }),
  row(A, '2026-09', 'Finance', {
    headcount: 10,
    joiners: 2,
    leavers: 1,
    female: 6,
    male: 4,
    ageBands: { under_25: 1, '25_34': 5, '35_44': 4, '45_54': 0, '55_plus': 0, unknown: 0 },
    pay: [
      { currency: 'AED', grade: 'G10', headcount: 3, payroll: '45000.00' },
      { currency: 'AED', grade: 'G5', headcount: 7, payroll: '70000.00' },
    ],
  }),
  row(A, '2026-09', 'Sales', {
    headcount: 5,
    female: 1,
    male: 3,
    otherGender: 1,
    ageBands: { under_25: 0, '25_34': 0, '35_44': 0, '45_54': 2, '55_plus': 2, unknown: 1 },
    pay: [
      { currency: 'AED', grade: 'G5', headcount: 3, payroll: '30000.00' },
      { currency: 'USD', grade: 'G5', headcount: 2, payroll: '6000.00' },
    ],
  }),
  row(B, '2026-09', 'Finance', {
    headcount: 4,
    leavers: 1,
    female: 2,
    male: 2,
    pay: [{ currency: 'AED', grade: 'G4', headcount: 4, payroll: '44000.00' }],
  }),
];

describe('helpers', () => {
  it('lists 12 months up to the period and computes one-decimal percentages', () => {
    expect(trendMonths('2026-02')).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(percentOf(1, 3)).toBe('33.3');
    expect(percentOf(1, 0)).toBeNull();
  });

  it('puts increments in buckets at their lower bounds', () => {
    expect(
      ['2.99', '3', '4.99', '5', '7.99', '8', '9.99', '10', '25'].map(incrementBucket),
    ).toEqual(['under_3', '3_5', '3_5', '5_8', '5_8', '8_10', '8_10', '10_plus', '10_plus']);
  });

  it('reads stored rows through the schema, leaving out malformed ones', () => {
    const rows: SummaryRow[] = [
      {
        entityId: 'a',
        entityCode: 'SUB-A',
        period: '2026-09',
        department: 'X',
        metrics: metrics(),
      },
      {
        entityId: 'a',
        entityCode: 'SUB-A',
        period: '2026-09',
        department: 'Y',
        metrics: { headcount: -1 },
      },
    ];
    expect(parseRows(rows)).toEqual([
      { entity: A, period: '2026-09', department: 'X', metrics: metrics() },
    ]);
  });
});

describe('groupOverview [DASH-D5]', () => {
  it('adds subsidiaries and departments for the month, with turnover and female share', () => {
    const view = groupOverview({ period: '2026-09', rows: ROWS, entities: [A, B] });
    expect(view).toMatchObject({
      period: '2026-09',
      previousPeriod: '2026-08',
      entities: 2,
      entitiesWithData: 2,
      headcount: 19,
      previousHeadcount: 12,
      joiners: 2,
      leavers: 2,
      // 2 leavers / ((19 + 12) / 2) = 12.9 %
      turnoverPercent: '12.9',
      female: 9,
      femaleSharePercent: '47.4',
      gender: { female: 9, male: 9, other: 1 },
    });
    expect(view.byEntity).toEqual([
      { entity: A, headcount: 15, joiners: 2, leavers: 1 },
      { entity: B, headcount: 4, joiners: 0, leavers: 1 },
    ]);
    expect(view.byDepartment).toEqual([
      { department: 'Finance', headcount: 14 },
      { department: 'Sales', headcount: 5 },
    ]);
    expect(view.ageBands.map((band) => band.count)).toEqual([1, 5, 4, 2, 2, 1]);
    // Grades sort naturally (G4, G5, G10).
    expect(view.grades).toEqual([
      { grade: 'G4', headcount: 4 },
      { grade: 'G5', headcount: 12 },
      { grade: 'G10', headcount: 3 },
    ]);
    expect(view.trend.slice(-3)).toEqual([
      { period: '2026-07', headcount: null },
      { period: '2026-08', headcount: 12 },
      { period: '2026-09', headcount: 19 },
    ]);
    expect(view.departments).toEqual(['Finance', 'Sales']);
  });

  it('filters by department and leaves out subsidiaries without data', () => {
    const view = groupOverview({
      period: '2026-09',
      rows: ROWS,
      entities: [A, B, { id: 'c', code: 'SUB-C' }],
      department: 'Sales',
    });
    expect(view).toMatchObject({
      entities: 3,
      entitiesWithData: 1,
      headcount: 5,
      previousHeadcount: null,
    });
    // Without last month, turnover is over this month's headcount: 0 of 5.
    expect(view.turnoverPercent).toBe('0.0');
    expect(view.departments).toEqual(['Finance', 'Sales']);
  });

  it('is empty without data', () => {
    const view = groupOverview({ period: '2026-09', rows: [], entities: [A] });
    expect(view).toMatchObject({
      headcount: 0,
      turnoverPercent: null,
      femaleSharePercent: null,
      byEntity: [],
      grades: [],
    });
    expect(view.ageBands.every((band) => band.count === 0)).toBe(true);
  });
});

describe('compensation [DASH-D6]', () => {
  const increments = [
    { entity: A, currency: 'AED', increase: '500.00', percent: '5.00' },
    { entity: A, currency: 'AED', increase: '1200.00', percent: '12.00' },
    { entity: B, currency: 'AED', increase: '200.00', percent: '2.00' },
    { entity: A, currency: 'USD', increase: '90.00', percent: '3.00' },
  ];
  const bands = [
    { grade: 'G5', minSalary: '9000.00', maxSalary: '12000.00', currency: 'AED' },
    { grade: 'G4', minSalary: '9000.00', maxSalary: '12000.00', currency: 'USD' },
  ];

  it('gives payroll per currency with its change, averages per grade and the trend', () => {
    const view = compensation({
      period: '2026-09',
      rows: ROWS,
      entities: [A, B],
      bands,
      increments,
    });
    expect(view.payroll).toEqual([
      // 45,000 + 70,000 + 30,000 + 44,000 = 189,000 vs 120,000: +57.5 %
      {
        currency: 'AED',
        amount: '189000.00',
        previousAmount: '120000.00',
        changePercent: '57.5',
        headcount: 17,
        average: '11117.65',
      },
      {
        currency: 'USD',
        amount: '6000.00',
        previousAmount: null,
        changePercent: null,
        headcount: 2,
        average: '3000.00',
      },
    ]);
    expect(view.grades).toEqual([
      { grade: 'G4', currency: 'AED', headcount: 4, average: '11000.00', band: null },
      {
        grade: 'G5',
        currency: 'AED',
        headcount: 10,
        average: '10000.00',
        band: { min: '9000.00', max: '12000.00' },
      },
      { grade: 'G10', currency: 'AED', headcount: 3, average: '15000.00', band: null },
      { grade: 'G5', currency: 'USD', headcount: 2, average: '3000.00', band: null },
    ]);
    expect(view.trend.slice(-2)).toEqual([
      { period: '2026-08', payroll: { AED: '120000.00' } },
      { period: '2026-09', payroll: { AED: '189000.00', USD: '6000.00' } },
    ]);
    expect(view.trend[0]).toEqual({ period: '2025-10', payroll: {} });
  });

  it('counts approved increments by size and their cost per subsidiary and currency', () => {
    const view = compensation({
      period: '2026-09',
      rows: ROWS,
      entities: [A, B],
      bands,
      increments,
    });
    expect(view.increments).toEqual({
      approved: 4,
      // (5 + 12 + 2 + 3) / 4 = 5.5
      averagePercent: '5.5',
      distribution: [
        { bucket: 'under_3', count: 1 },
        { bucket: '3_5', count: 1 },
        { bucket: '5_8', count: 1 },
        { bucket: '8_10', count: 0 },
        { bucket: '10_plus', count: 1 },
      ],
      costImpact: [
        {
          entity: A,
          currency: 'AED',
          employees: 2,
          monthlyIncrease: '1700.00',
          annualIncrease: '20400.00',
        },
        {
          entity: A,
          currency: 'USD',
          employees: 1,
          monthlyIncrease: '90.00',
          annualIncrease: '1080.00',
        },
        {
          entity: B,
          currency: 'AED',
          employees: 1,
          monthlyIncrease: '200.00',
          annualIncrease: '2400.00',
        },
      ],
    });
  });

  it('is empty without data or increments, and follows a department', () => {
    const empty = compensation({
      period: '2026-09',
      rows: [],
      entities: [],
      bands: [],
      increments: [],
    });
    expect(empty).toMatchObject({
      payroll: [],
      grades: [],
      increments: { approved: 0, averagePercent: null, costImpact: [] },
    });
    const sales = compensation({
      period: '2026-09',
      rows: ROWS,
      entities: [A, B],
      bands: [],
      increments: [],
      department: 'Sales',
    });
    expect(
      sales.payroll.map((entry) => [entry.currency, entry.amount, entry.previousAmount]),
    ).toEqual([
      ['AED', '30000.00', null],
      ['USD', '6000.00', null],
    ]);
  });
});

describe('executiveView [DASH-D8]', () => {
  it('shows group totals per subsidiary, missing uploads and open flags, no names', () => {
    const view = executiveView({
      period: '2026-09',
      rows: ROWS,
      entities: [A, B, { id: 'c', code: 'SUB-C' }],
      openFlags: new Map([
        ['a', 3],
        ['c', 1],
      ]),
    });
    expect(view).toMatchObject({
      headcount: 19,
      previousHeadcount: 12,
      entities: 3,
      entitiesWithData: 2,
      turnoverPercent: '12.9',
      femaleSharePercent: '47.4',
      openFlags: 4,
    });
    expect(view.payroll).toEqual([
      { currency: 'AED', amount: '189000.00', changePercent: '57.5' },
      { currency: 'USD', amount: '6000.00', changePercent: null },
    ]);
    expect(view.byEntity).toEqual([
      {
        entity: A,
        headcount: 15,
        payroll: { AED: '145000.00', USD: '6000.00' },
        openFlags: 3,
        missing: false,
      },
      { entity: B, headcount: 4, payroll: { AED: '44000.00' }, openFlags: 0, missing: false },
      {
        entity: { id: 'c', code: 'SUB-C' },
        headcount: 0,
        payroll: {},
        openFlags: 1,
        missing: true,
      },
    ]);
    expect(JSON.stringify(view)).not.toContain('G5');
  });
});
