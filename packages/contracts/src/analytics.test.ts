import { describe, expect, it } from 'vitest';
import { AnalyticsQuerySchema, TatReportQuerySchema } from './analytics.js';

const CYCLE = '00000000-0000-4000-8000-00000000c026';

describe('analytics contracts [R1-11, R1-12]', () => {
  it('filters by period and subsidiary only', () => {
    expect(AnalyticsQuerySchema.parse({ cycleId: CYCLE })).toEqual({ cycleId: CYCLE });
    expect(AnalyticsQuerySchema.safeParse({ cycleId: 'x' }).success).toBe(false);
    expect(AnalyticsQuerySchema.safeParse({ status: 'approved' }).success).toBe(false);
  });

  it('takes RP-02 as Excel in a locale, English by default', () => {
    expect(TatReportQuerySchema.parse({ format: 'xlsx' })).toEqual({
      format: 'xlsx',
      locale: 'en',
    });
    expect(TatReportQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false);
  });
});
