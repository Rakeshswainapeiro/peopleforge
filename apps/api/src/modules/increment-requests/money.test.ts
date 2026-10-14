import { describe, expect, it } from 'vitest';
import { lineFigures, proposalProblem, requestTotals, toMoney } from './money.js';

// Worked examples from the Figma "New increment request" table.
describe('lineFigures', () => {
  it('turns a percentage into an amount, rounded half-up to 2 decimals', () => {
    expect(lineFigures('21500.00', 'percent', '8')).toEqual({
      increase: '1720.00',
      newSalary: '23220.00',
      percent: '8.00',
    });
    expect(lineFigures('16800.00', 'percent', '7.3')).toEqual({
      increase: '1226.40',
      newSalary: '18026.40',
      percent: '7.30',
    });
    // 0.125 → 0.13 (half-up), never 0.12 (banker's) or 0.12499999 (floating point).
    expect(lineFigures('12.50', 'percent', '1')?.increase).toBe('0.13');
  });

  it('turns an amount into a percentage, rounded half-up to 2 decimals', () => {
    expect(lineFigures('21500.00', 'amount', '1720')).toEqual({
      increase: '1720.00',
      newSalary: '23220.00',
      percent: '8.00',
    });
    expect(lineFigures('3.00', 'amount', '1')?.percent).toBe('33.33');
    expect(lineFigures('3.00', 'amount', '2')?.percent).toBe('66.67');
  });

  it('handles a zero salary without dividing by zero', () => {
    expect(lineFigures('0.00', 'amount', '100')).toEqual({
      increase: '100.00',
      newSalary: '100.00',
      percent: '0.00',
    });
  });

  it('has no figures without a proposal', () => {
    expect(lineFigures('21500.00', null, null)).toBeNull();
    expect(lineFigures('21500.00', 'percent', null)).toBeNull();
  });

  it('stays exact at the largest allowed values', () => {
    expect(lineFigures('999999999.99', 'percent', '100')?.newSalary).toBe('1999999999.98');
  });
});

describe('proposalProblem', () => {
  it.each([
    ['percent', '0', 'not_positive'],
    ['amount', '0.00', 'not_positive'],
    ['percent', '100.01', 'over_limit'],
    ['amount', '21500.01', 'over_limit'],
    ['percent', '0.01', null],
    ['percent', '100', null],
    ['amount', '21500', null],
  ] as const)('%s %s → %s', (kind, value, expected) => {
    expect(proposalProblem('21500.00', kind, value)).toBe(expected);
  });
});

describe('requestTotals', () => {
  it('sums per currency and averages the percentages: (8 + 6 + 7.3 + 5.5 + 5) / 5 = 6.36 → 6.4', () => {
    const lines = [
      { currency: 'AED', figures: lineFigures('21500.00', 'percent', '8') },
      { currency: 'AED', figures: lineFigures('16800.00', 'percent', '6') },
      { currency: 'AED', figures: lineFigures('16800.00', 'percent', '7.3') },
      { currency: 'AED', figures: lineFigures('16800.00', 'percent', '5.5') },
      { currency: 'USD', figures: lineFigures('5000.00', 'amount', '250') },
      { currency: 'AED', figures: null },
    ];
    expect(requestTotals(lines)).toEqual({
      employees: 6,
      proposed: 5,
      increaseByCurrency: [
        { currency: 'AED', amount: '4878.40' },
        { currency: 'USD', amount: '250.00' },
      ],
      averagePercent: '6.4',
    });
  });

  it('has no average without proposals', () => {
    expect(requestTotals([{ currency: 'AED', figures: null }])).toEqual({
      employees: 1,
      proposed: 0,
      increaseByCurrency: [],
      averagePercent: null,
    });
  });
});

describe('toMoney', () => {
  it('normalises to 2 decimals', () => {
    expect(toMoney('8')).toBe('8.00');
    expect(toMoney('8.5')).toBe('8.50');
  });
});
