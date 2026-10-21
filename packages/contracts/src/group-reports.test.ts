import { describe, expect, it } from 'vitest';
import {
  GROUP_REPORTS,
  GROUP_REPORT_SPECS,
  groupReportSpec,
  periodBounds,
  GroupReportQuerySchema,
  monthsOfPeriod,
  reportPeriodSchema,
} from './group-reports.js';

// Group HR reports (R2-06, R2-07): periods per cadence, formats per report.

describe('group reports [R2-06, R2-07]', () => {
  it('cuts monthly, quarterly and annual periods', () => {
    expect(reportPeriodSchema('month').safeParse('2026-09').success).toBe(true);
    expect(reportPeriodSchema('month').safeParse('2026-Q3').success).toBe(false);
    expect(reportPeriodSchema('quarter').safeParse('2026-Q3').success).toBe(true);
    expect(reportPeriodSchema('quarter').safeParse('2026-Q5').success).toBe(false);
    expect(reportPeriodSchema('year').safeParse('2026').success).toBe(true);
    expect(reportPeriodSchema('year').safeParse('26').success).toBe(false);
    expect(monthsOfPeriod('2026-09', 'month')).toEqual(['2026-09']);
    expect(monthsOfPeriod('2026-Q4', 'quarter')).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(monthsOfPeriod('2026-Q1', 'quarter')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(monthsOfPeriod('2026', 'year')).toHaveLength(12);
    expect(monthsOfPeriod('2026', 'year').at(-1)).toBe('2026-12');
  });

  it('knows each report and the bounds of its period', () => {
    expect(GROUP_REPORTS.map((code) => groupReportSpec(code).cadence)).toEqual([
      'month',
      'month',
      'month',
      'quarter',
      'year',
    ]);
    expect(periodBounds('2026-09', 'month')).toEqual({ first: '2026-09', last: '2026-09' });
    expect(periodBounds('2026-Q3', 'quarter')).toEqual({ first: '2026-07', last: '2026-09' });
    expect(periodBounds('2026', 'year')).toEqual({ first: '2026-01', last: '2026-12' });
  });

  it('offers PDF only for the quarterly and annual reviews', () => {
    expect(GROUP_REPORT_SPECS['rp-06'].formats).toEqual(['pdf']);
    expect(GROUP_REPORT_SPECS['rp-03'].formats).toEqual(['xlsx', 'pdf']);
  });

  it('takes a period, a format, a language and an optional subsidiary, nothing else', () => {
    expect(GroupReportQuerySchema.parse({ period: '2026-09', format: 'pdf' })).toEqual({
      period: '2026-09',
      format: 'pdf',
      locale: 'en',
    });
    expect(GroupReportQuerySchema.safeParse({ period: '2026-09', format: 'csv' }).success).toBe(
      false,
    );
    expect(
      GroupReportQuerySchema.safeParse({ period: '2026-09', format: 'pdf', extra: 1 }).success,
    ).toBe(false);
  });
});
