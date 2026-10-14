import { Decimal } from 'decimal.js';
import type { ProposedKind, RequestTotals } from '@peopleforge/contracts';

/**
 * Increment arithmetic (R1-02). Decimal only, never floating point. Rules, agreed 2026-10-14:
 * - Amounts are monthly, in the employee's salary currency, to 2 decimals.
 * - A percentage increment is rounded to 2 decimals, half-up: 8% of 21,500.00 = 1,720.00.
 * - An amount's percentage is shown to 2 decimals, half-up: 1,720 of 21,500 = 8.00%.
 * - The request average is the simple mean of the employees' percentages, 1 decimal, half-up.
 * Worked examples: money.test.ts.
 */
const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface LineFigures {
  increase: string;
  newSalary: string;
  percent: string;
}

/** Normalises a decimal string to 2 places, e.g. "8" → "8.00". */
export function toMoney(value: string): string {
  return new Money(value).toFixed(2);
}

export function lineFigures(
  currentSalary: string,
  kind: ProposedKind | null,
  value: string | null,
): LineFigures | null {
  if (kind === null || value === null) return null;
  const current = new Money(currentSalary);
  const proposed = new Money(value);
  const increase =
    kind === 'percent' ? current.times(proposed).dividedBy(100).toDecimalPlaces(2) : proposed;
  const percent =
    kind === 'percent'
      ? proposed
      : current.isZero()
        ? new Money(0)
        : proposed.dividedBy(current).times(100).toDecimalPlaces(2);
  return {
    increase: increase.toFixed(2),
    newSalary: current.plus(increase).toFixed(2),
    percent: percent.toFixed(2),
  };
}

export type ProposalProblem = 'not_positive' | 'over_limit';

/**
 * Bounds for a proposal: more than zero, and at most a 100% increase (an amount up to the
 * current salary). A larger increase is not an increment; Sirius HR can widen this later.
 */
export function proposalProblem(
  currentSalary: string,
  kind: ProposedKind,
  value: string,
): ProposalProblem | null {
  const proposed = new Money(value);
  if (proposed.lessThanOrEqualTo(0)) return 'not_positive';
  const limit = kind === 'percent' ? new Money(100) : new Money(currentSalary);
  return proposed.greaterThan(limit) ? 'over_limit' : null;
}

/** `complete`: every criterion done for the employee (R1-06); with a proposal, ready to submit. */
export function requestTotals(
  lines: readonly { currency: string; figures: LineFigures | null; complete: boolean }[],
): RequestTotals {
  const byCurrency = new Map<string, Decimal>();
  const percents: Decimal[] = [];
  let ready = 0;
  for (const line of lines) {
    if (line.figures === null) continue;
    if (line.complete) ready += 1;
    const sum = byCurrency.get(line.currency) ?? new Money(0);
    byCurrency.set(line.currency, sum.plus(line.figures.increase));
    percents.push(new Money(line.figures.percent));
  }
  const average =
    percents.length === 0
      ? null
      : Money.sum(...percents)
          .dividedBy(percents.length)
          .toDecimalPlaces(1)
          .toFixed(1);
  return {
    employees: lines.length,
    proposed: percents.length,
    ready,
    increaseByCurrency: [...byCurrency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) })),
    averagePercent: average,
  };
}
