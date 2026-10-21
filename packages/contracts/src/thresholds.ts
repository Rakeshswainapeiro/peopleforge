import { z } from 'zod';

/**
 * Criterion thresholds (R1-05, "admin can add/edit criteria and thresholds"): a criterion may
 * pass on a measured value instead of a judgement, e.g. "performance rating ≥ 3.5" or
 * "attendance ≥ 95 %". The preparer enters the employee's value; the result follows from it,
 * by this one rule in the API and on the request page. Values are exact decimals (never floats).
 */

export const THRESHOLD_OPERATORS = ['gte', 'lte'] as const;
export const THRESHOLD_UNITS = ['rating', 'score', 'percent', 'months', 'years', 'days'] as const;

/** A measured value or threshold: up to 6 digits and 2 decimals, not negative ("3.5", "95"). */
export const ThresholdValueSchema = z
  .string()
  .trim()
  // eslint-disable-next-line security/detect-unsafe-regex -- every quantifier is bounded (≤ 9 chars): no backtracking blow-up
  .regex(/^\d{1,6}(\.\d{1,2})?$/u);

export const CriterionThresholdSchema = z.strictObject({
  operator: z.enum(THRESHOLD_OPERATORS),
  value: ThresholdValueSchema,
  unit: z.enum(THRESHOLD_UNITS),
});
export type CriterionThreshold = z.infer<typeof CriterionThresholdSchema>;

/** A threshold value in hundredths, exactly: "3.5" → 350n. */
function hundredths(value: string): bigint {
  const dot = value.indexOf('.');
  const whole = dot === -1 ? value : value.slice(0, dot);
  const fraction = dot === -1 ? '' : value.slice(dot + 1);
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Whether a measured value meets the threshold (≥ or ≤, inclusive). */
export function meetsThreshold(threshold: CriterionThreshold, value: string): boolean {
  const measured = hundredths(value);
  const bar = hundredths(threshold.value);
  return threshold.operator === 'gte' ? measured >= bar : measured <= bar;
}

/** The result a measured value gives: pass or fail, or none until a valid value is entered. */
export function thresholdResult(
  threshold: CriterionThreshold,
  value: string | null,
): 'pass' | 'fail' | null {
  const parsed = ThresholdValueSchema.safeParse(value);
  if (!parsed.success) return null;
  return meetsThreshold(threshold, parsed.data) ? 'pass' : 'fail';
}
