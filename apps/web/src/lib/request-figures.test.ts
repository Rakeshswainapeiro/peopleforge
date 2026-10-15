import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { draftRequest, submittedRequest } from '@/test-support/requests';
import { requestFigures, totalIncrease } from './request-figures';

const t = createTranslator('en');

describe('totalIncrease', () => {
  it('sums per currency, or says there is none', () => {
    expect(totalIncrease(draftRequest(), 'en', t)).toMatch(/^AED\s1,720$/u);
    const mixed = draftRequest({
      totals: {
        ...draftRequest().totals,
        increaseByCurrency: [
          { currency: 'AED', amount: '1200.00' },
          { currency: 'USD', amount: '300.00' },
        ],
      },
    });
    expect(totalIncrease(mixed, 'en', t)).toMatch(/^AED\s1,200 \+ USD\s300$/u);
    const none = draftRequest({ totals: { ...draftRequest().totals, increaseByCurrency: [] } });
    expect(totalIncrease(none, 'en', t)).toBe('—');
  });
});

describe('requestFigures [R1-07]', () => {
  it('shows employees, the monthly total and the average, as in the Figma', () => {
    const [employees, total, average] = requestFigures(submittedRequest(), 'en', t);
    expect(employees).toEqual({
      label: 'Employees',
      value: '2',
      hint: 'All 5 criteria complete',
    });
    expect(total).toMatchObject({ label: 'Total increment / month', hint: 'Across all employees' });
    expect(average).toEqual({ label: 'Average increment', value: '8%', hint: 'Proposed' });
  });

  it('counts employees not complete yet, and has no average without proposals', () => {
    const draft = draftRequest();
    expect(requestFigures(draft, 'en', t)[0]?.hint).toBe('2 employees not complete');
    const one = draftRequest({
      lines: [...submittedRequest().lines.slice(0, 1), ...draft.lines.slice(1)],
      totals: { ...draft.totals, averagePercent: null },
    });
    const [employees, , average] = requestFigures(one, 'en', t);
    expect(employees?.hint).toBe('1 employee not complete');
    expect(average?.value).toBe('—');
  });
});
