import { describe, expect, it } from 'vitest';
import {
  CompensationSchema,
  ExecutiveQuerySchema,
  ExecutiveViewSchema,
  GroupDashboardQuerySchema,
  GroupOverviewSchema,
  MoneyByCurrencySchema,
} from './group-analytics.js';

const ENTITY = { id: '00000000-0000-4000-8000-0000000e000a', code: 'SUB-A' };

// The group dashboards' contracts (R2-05, R2-07): queries refused at the boundary, and the
// figures as the API sends them (decimal strings per currency, never numbers).

describe('GroupDashboardQuerySchema [DASH-D5, D6]', () => {
  it('takes a month with an optional subsidiary and department, and nothing else', () => {
    expect(
      GroupDashboardQuerySchema.parse({ period: '2026-09', department: '  Finance ' }),
    ).toEqual({ period: '2026-09', department: 'Finance' });
    expect(GroupDashboardQuerySchema.safeParse({ period: '2026-13' }).success).toBe(false);
    expect(
      GroupDashboardQuerySchema.safeParse({ period: '2026-09', entityId: 'SUB-A' }).success,
    ).toBe(false);
    expect(
      GroupDashboardQuerySchema.safeParse({ period: '2026-09', department: 'x'.repeat(81) })
        .success,
    ).toBe(false);
    expect(GroupDashboardQuerySchema.safeParse({ period: '2026-09', sort: 'pay' }).success).toBe(
      false,
    );
    expect(ExecutiveQuerySchema.safeParse({ period: '2026-09', entityId: ENTITY.id }).success).toBe(
      false,
    );
  });
});

describe('figures', () => {
  it('keeps amounts per currency as decimal strings', () => {
    expect(MoneyByCurrencySchema.parse({ AED: '1250000.00' })).toEqual({ AED: '1250000.00' });
    expect(MoneyByCurrencySchema.safeParse({ AED: 1250000 }).success).toBe(false);
  });

  it('parses an overview, compensation and executive view', () => {
    const trend = [{ period: '2026-09', headcount: null }];
    expect(
      GroupOverviewSchema.safeParse({
        period: '2026-09',
        previousPeriod: '2026-08',
        entities: 1,
        entitiesWithData: 0,
        headcount: 0,
        previousHeadcount: null,
        joiners: 0,
        leavers: 0,
        turnoverPercent: null,
        female: 0,
        femaleSharePercent: null,
        byEntity: [{ entity: ENTITY, headcount: 0, joiners: 0, leavers: 0 }],
        byDepartment: [],
        gender: { female: 0, male: 0, other: 0 },
        ageBands: [{ band: 'unknown', count: 0 }],
        grades: [],
        trend,
        departments: [],
      }).success,
    ).toBe(true);
    expect(
      CompensationSchema.safeParse({
        period: '2026-09',
        previousPeriod: '2026-08',
        payroll: [
          {
            currency: 'AED',
            amount: '100.00',
            previousAmount: null,
            changePercent: null,
            headcount: 1,
            average: '100.00',
          },
        ],
        trend: [{ period: '2026-09', payroll: { AED: '100.00' } }],
        grades: [{ grade: 'G5', currency: 'AED', headcount: 1, average: '100.00', band: null }],
        increments: {
          approved: 1,
          averagePercent: '5.0',
          distribution: [{ bucket: '5_8', count: 1 }],
          costImpact: [
            {
              entity: ENTITY,
              currency: 'AED',
              employees: 1,
              monthlyIncrease: '5.00',
              annualIncrease: '60.00',
            },
          ],
        },
        departments: ['Finance'],
      }).success,
    ).toBe(true);
    expect(
      ExecutiveViewSchema.safeParse({
        period: '2026-09',
        previousPeriod: '2026-08',
        entities: 1,
        entitiesWithData: 1,
        headcount: 1,
        previousHeadcount: 1,
        joiners: 0,
        leavers: 0,
        turnoverPercent: '0.0',
        femaleSharePercent: '100.0',
        payroll: [{ currency: 'AED', amount: '100.00', changePercent: '0.0' }],
        byEntity: [
          {
            entity: ENTITY,
            headcount: 1,
            payroll: { AED: '100.00' },
            openFlags: 0,
            missing: false,
          },
        ],
        trend,
        openFlags: 0,
      }).success,
    ).toBe(true);
  });
});
