import type { Compensation, ExecutiveView, FlagPage, GroupOverview } from '@peopleforge/contracts';
import { SUB_A, SUB_B } from './factory.js';

/**
 * Synthetic group figures for the report tests (R2-06, R2-07): the shapes the dashboards serve,
 * with small worked numbers. Never real employees.
 */

const A = { id: SUB_A, code: 'SUB-A' };
const B = { id: SUB_B, code: 'SUB-B' };

export function overviewFixture(overrides: Partial<GroupOverview> = {}): GroupOverview {
  return {
    period: '2026-09',
    previousPeriod: '2026-08',
    entities: 2,
    entitiesWithData: 2,
    headcount: 20,
    previousHeadcount: 18,
    joiners: 3,
    leavers: 1,
    turnoverPercent: '5.3',
    female: 9,
    femaleSharePercent: '45.0',
    byEntity: [
      { entity: A, headcount: 15, joiners: 2, leavers: 1 },
      { entity: B, headcount: 5, joiners: 1, leavers: 0 },
    ],
    byDepartment: [
      { department: 'Finance', headcount: 12 },
      { department: '=HYPERLINK("x")', headcount: 8 },
    ],
    gender: { female: 9, male: 10, other: 1 },
    ageBands: [
      { band: '25_34', count: 12 },
      { band: 'unknown', count: 8 },
    ],
    grades: [{ grade: 'G5', headcount: 20 }],
    trend: [
      { period: '2026-08', headcount: 18 },
      { period: '2026-09', headcount: 20 },
      { period: '2026-07', headcount: null },
    ],
    departments: ['Finance'],
    ...overrides,
  };
}

export function compensationFixture(overrides: Partial<Compensation> = {}): Compensation {
  return {
    period: '2026-09',
    previousPeriod: '2026-08',
    payroll: [
      {
        currency: 'AED',
        amount: '210000.50',
        previousAmount: '200000.00',
        changePercent: '5.0',
        headcount: 18,
        average: '11666.69',
      },
      {
        currency: 'USD',
        amount: '6000.00',
        previousAmount: null,
        changePercent: null,
        headcount: 2,
        average: '3000.00',
      },
    ],
    trend: [{ period: '2026-09', payroll: { AED: '210000.50', USD: '6000.00' } }],
    grades: [
      {
        grade: 'G5',
        currency: 'AED',
        headcount: 18,
        average: '11666.69',
        band: { min: '9000.00', max: '14000.00' },
      },
      { grade: 'G5', currency: 'USD', headcount: 2, average: '3000.00', band: null },
    ],
    increments: {
      approved: 2,
      averagePercent: '6.5',
      distribution: [
        { bucket: '5_8', count: 2 },
        { bucket: '10_plus', count: 0 },
      ],
      costImpact: [
        {
          entity: A,
          currency: 'AED',
          employees: 2,
          monthlyIncrease: '1300.00',
          annualIncrease: '15600.00',
        },
      ],
    },
    departments: ['Finance'],
    ...overrides,
  };
}

export function executiveFixture(overrides: Partial<ExecutiveView> = {}): ExecutiveView {
  return {
    period: '2026-09',
    previousPeriod: '2026-08',
    entities: 2,
    entitiesWithData: 2,
    headcount: 20,
    previousHeadcount: 18,
    joiners: 3,
    leavers: 1,
    turnoverPercent: '5.3',
    femaleSharePercent: '45.0',
    payroll: [{ currency: 'AED', amount: '210000.50', changePercent: '5.0' }],
    byEntity: [
      {
        entity: A,
        headcount: 15,
        payroll: { AED: '150000.50', USD: '6000.00' },
        openFlags: 2,
        missing: false,
      },
      { entity: B, headcount: 5, payroll: { AED: '60000.00' }, openFlags: 0, missing: false },
    ],
    trend: [{ period: '2026-09', headcount: 20 }],
    openFlags: 2,
    ...overrides,
  };
}

export function flagPageFixture(overrides: Partial<FlagPage> = {}): FlagPage {
  return {
    items: [
      {
        id: '88888888-8888-4888-8888-888888888881',
        reference: 'AN-0001',
        entity: A,
        period: '2026-09',
        upload: { id: '66666666-6666-4666-8666-666666666661', reference: 'UP-0001' },
        ruleCode: 'ANM-03',
        ruleKind: 'salary_change',
        employeeNumber: 'EMP-1101',
        employeeName: 'Aisha Rahman',
        field: 'gross_salary',
        detail: { previous: '10000.00', current: '14200.00' },
        owner: { id: 'oid-alpha', name: 'Alpha HR' },
        status: 'open',
        note: null,
        resolvedReason: null,
        createdAt: '2026-10-02T06:00:00.000Z',
        updatedAt: '2026-10-02T06:00:00.000Z',
        resolvedAt: null,
      },
      {
        id: '88888888-8888-4888-8888-888888888882',
        reference: 'AN-0002',
        entity: A,
        period: '2026-09',
        upload: { id: '66666666-6666-4666-8666-666666666661', reference: 'UP-0001' },
        ruleCode: 'ANM-08',
        ruleKind: 'headcount_change',
        employeeNumber: null,
        employeeName: null,
        field: null,
        detail: {},
        owner: { id: 'oid-alpha', name: 'Alpha HR' },
        status: 'in_progress',
        note: null,
        resolvedReason: null,
        createdAt: '2026-10-02T06:00:00.000Z',
        updatedAt: '2026-10-02T06:00:00.000Z',
        resolvedAt: null,
      },
      {
        id: '88888888-8888-4888-8888-888888888883',
        reference: 'AN-0003',
        entity: B,
        period: '2026-09',
        upload: { id: '66666666-6666-4666-8666-666666666662', reference: 'UP-0002' },
        ruleCode: 'ANM-01',
        ruleKind: 'missing_employee',
        employeeNumber: 'EMP-2201',
        employeeName: null,
        field: null,
        detail: {},
        owner: { id: 'oid-beta', name: 'Beta HR' },
        status: 'resolved',
        note: 'Left in August.',
        resolvedReason: null,
        createdAt: '2026-10-03T06:00:00.000Z',
        updatedAt: '2026-10-04T06:00:00.000Z',
        resolvedAt: '2026-10-04T06:00:00.000Z',
      },
    ],
    rules: [{ code: 'ANM-03', kind: 'salary_change' }],
    page: 1,
    pageSize: 2000,
    total: 3,
    counts: { open: 1, in_progress: 1, resolved: 1 },
    oldestOpenAt: '2026-10-02T06:00:00.000Z',
    byEntity: [
      { entity: A, counts: { open: 1, in_progress: 1, resolved: 0 } },
      { entity: B, counts: { open: 0, in_progress: 0, resolved: 1 } },
    ],
    variations: [
      {
        entity: A,
        upload: { id: '66666666-6666-4666-8666-666666666661', reference: 'UP-0001', version: 2 },
        comparison: {
          previousPeriod: '2026-08',
          headcount: 15,
          previousHeadcount: 14,
          payrollChangePercent: '3.2',
          newRecords: 2,
          left: 1,
          missing: 0,
          changed: 4,
          warnings: [],
        },
        flags: 2,
      },
      {
        entity: B,
        upload: { id: '66666666-6666-4666-8666-666666666662', reference: 'UP-0002', version: 1 },
        comparison: null,
        flags: 1,
      },
    ],
    ...overrides,
  };
}
