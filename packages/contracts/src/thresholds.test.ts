import { describe, expect, it } from 'vitest';
import {
  CriterionThresholdSchema,
  meetsThreshold,
  thresholdResult,
  ThresholdValueSchema,
} from './thresholds.js';

// Criterion thresholds (R1-05): exact decimal comparison, inclusive, at the boundary.

describe('thresholds [R1-05]', () => {
  const rating = { operator: 'gte', value: '3.5', unit: 'rating' } as const;
  const absence = { operator: 'lte', value: '5', unit: 'days' } as const;

  it('passes at or beyond the threshold, both ways, exactly at the boundary', () => {
    expect(meetsThreshold(rating, '3.5')).toBe(true);
    expect(meetsThreshold(rating, '3.50')).toBe(true);
    expect(meetsThreshold(rating, '3.49')).toBe(false);
    expect(meetsThreshold(rating, '10')).toBe(true);
    expect(meetsThreshold(absence, '5.00')).toBe(true);
    expect(meetsThreshold(absence, '5.01')).toBe(false);
    expect(meetsThreshold(absence, '0')).toBe(true);
    // Large values compare exactly (no floating point).
    expect(meetsThreshold({ ...rating, value: '999999.99' }, '999999.99')).toBe(true);
    expect(meetsThreshold({ ...rating, value: '999999.99' }, '999999.98')).toBe(false);
  });

  it('gives no result until a valid value is entered', () => {
    expect(thresholdResult(rating, null)).toBeNull();
    expect(thresholdResult(rating, '')).toBeNull();
    expect(thresholdResult(rating, '-1')).toBeNull();
    expect(thresholdResult(rating, '3,5')).toBeNull();
    expect(thresholdResult(rating, ' 4 ')).toBe('pass');
    expect(thresholdResult(rating, '2')).toBe('fail');
  });

  it('accepts only bounded, non-negative values and known operators and units', () => {
    expect(ThresholdValueSchema.safeParse('1234567').success).toBe(false);
    expect(ThresholdValueSchema.safeParse('1.234').success).toBe(false);
    expect(CriterionThresholdSchema.safeParse(rating).success).toBe(true);
    expect(CriterionThresholdSchema.safeParse({ ...rating, operator: 'gt' }).success).toBe(false);
    expect(CriterionThresholdSchema.safeParse({ ...rating, unit: 'furlongs' }).success).toBe(false);
    expect(CriterionThresholdSchema.safeParse({ ...rating, extra: 1 }).success).toBe(false);
  });
});
