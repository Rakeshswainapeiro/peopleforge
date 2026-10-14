import type { CriterionMissing, IncrementRequest } from '@peopleforge/contracts';
import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { draftRequest, LINE_1, must, notStarted, REQUEST_ID } from '@/test-support/requests';
import {
  criteriaCards,
  criteriaLabels,
  employeesAdded,
  evidenceMessages,
  proposalRows,
  readyView,
  saveMessages,
  tableLabels,
  totalsView,
} from './request-view';

const t = createTranslator('en');

const request = (overrides: Partial<IncrementRequest> = {}) =>
  draftRequest({
    totals: {
      employees: 2,
      proposed: 1,
      ready: 0,
      increaseByCurrency: [
        { currency: 'AED', amount: '1720.00' },
        { currency: 'USD', amount: '250.50' },
      ],
      averagePercent: '6.6',
    },
    ...overrides,
  });

describe('proposalRows', () => {
  it('formats amounts and labels each row for screen readers', () => {
    const [first, second] = proposalRows(request(), 'en', t);
    expect(first?.current).toMatch(/^AED\s21,500$/u);
    expect(first?.criteriaLabel).toBe('2/5 complete');
    // A result shows once the criterion is complete; until then it is "not complete yet".
    expect(first?.criteria.map((criterion) => criterion.state)).toEqual([
      'pass',
      'fail',
      'pending',
      'pending',
      'pending',
    ]);
    expect(second?.criteriaLabel).toBe('0/5 complete');
    expect(first).toMatchObject({
      kind: 'percent',
      value: '8',
      currencyCode: 'AED',
      labels: {
        proposedAs: 'Proposed as, for Omar Haddad',
        value: 'Proposed increase for Omar Haddad',
        remove: 'Remove Omar Haddad',
        assess: 'Assess criteria for Omar Haddad',
      },
    });
    expect(second).toMatchObject({ kind: 'percent', value: '' });
  });

  it('shows criteria the API left out as not complete (version skew)', () => {
    const skewed = request();
    const [omar] = skewed.lines;
    if (omar !== undefined) omar.criteria = [];
    expect(proposalRows(skewed, 'en', t)[0]?.criteria.every((c) => c.state === 'pending')).toBe(
      true,
    );
  });
});

describe('criteriaCards [R1-03, R1-04, R1-06]', () => {
  const cards = () => {
    const draft = request();
    return criteriaCards(draft, must(draft.lines[0]), 'en', t);
  };

  it('describes each criterion with the employee’s result, text and files', () => {
    const [c1, c2, c3, , c5] = cards();
    expect(c1).toMatchObject({
      code: 'C1',
      name: '[Placeholder] Criterion 1',
      description: 'What criterion 1 asks for.',
      result: 'pass',
      justification: 'Rated 4 of 5 in the 2026 appraisal.',
      complete: true,
      missingText: undefined,
      resultLegend: 'Result for C1',
    });
    expect(c1?.evidence).toMatchObject({
      policyLabel: 'Required',
      rules: 'PDF, PNG, JPEG, Excel · up to 10 MB each · at most 5 files',
      accept:
        'application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      maxBytes: 10 * 1024 * 1024,
      canAdd: true,
      files: [
        {
          fileName: 'appraisal-2026.pdf',
          meta: 'PDF · 2 kB',
          href: `/requests/${REQUEST_ID}/evidence/55555555-5555-4555-8555-555555555551`,
          downloadLabel: 'Download appraisal-2026.pdf',
          removeLabel: 'Remove appraisal-2026.pdf',
        },
      ],
      labels: { attach: 'Attach file', attachFor: 'Attach a file for C1' },
    });
    expect(c2?.evidence?.files[0]?.meta).toBe('PNG · 3 MB');
    expect(c3?.missingText).toBe('To complete: add a justification, attach evidence');
    expect(c5?.evidence?.policyLabel).toBe('Optional');
  });

  it('stops offering uploads at the limit, and shows types without a name as they are', () => {
    const draft = request();
    const [c1] = draft.criteria;
    if (c1 !== undefined) {
      c1.allowedMediaTypes = ['text/csv'];
      c1.evidencePolicy = 'none';
    }
    const [omar] = draft.lines;
    const file = omar?.criteria[1]?.evidence[0];
    if (omar !== undefined && file !== undefined) {
      omar.criteria[1] = { ...must(omar.criteria[1]), evidence: [file, file, file, file, file] };
    }
    const [first, second] = criteriaCards(draft, must(omar), 'en', t);
    expect(first?.evidence).toBeNull();
    expect(second?.evidence?.canAdd).toBe(false);
    const csvOnly = request();
    must(csvOnly.criteria[0]).allowedMediaTypes = ['text/csv'];
    expect(criteriaCards(csvOnly, must(csvOnly.lines[0]), 'en', t)[0]?.evidence?.rules).toMatch(
      /^text\/csv · /u,
    );
  });

  it('treats a criterion the API left out as not started (version skew)', () => {
    const draft = request();
    const line = { ...must(draft.lines[1]), criteria: [notStarted('x')] };
    const [, second] = criteriaCards(draft, line, 'en', t);
    expect(second).toMatchObject({
      result: null,
      justification: '',
      complete: false,
      missingText: 'To complete: choose Pass or Fail, add a justification, attach evidence',
    });
    expect(second?.evidence?.files).toEqual([]);
  });

  it('uses a criterion’s Arabic name when it has one', () => {
    const draft = request();
    const [first] = draft.criteria;
    if (first !== undefined) first.name = { en: 'Performance', ar: 'الأداء' };
    const [card] = criteriaCards(draft, must(draft.lines[0]), 'ar', createTranslator('ar'));
    expect(card).toMatchObject({ name: 'الأداء', description: 'What criterion 1 asks for.' });
  });

  it('labels the editor and translates evidence messages', () => {
    expect(criteriaLabels('en', t)).toMatchObject({
      pass: 'Pass',
      fail: 'Fail',
      justificationHint: 'Up to 2,000 characters.',
      incomplete: 'Not complete yet',
    });
    expect(new Map(evidenceMessages(t)).get('evidence.errors.infected')).toMatch(/malware/u);
  });
});

describe('readyView', () => {
  it('says who is ready and what the others still need', () => {
    const draft = request();
    expect(readyView(draft, 'en', t)).toMatchObject({
      summary: '0 of 2 employees ready',
      items: [
        { lineId: LINE_1, ready: false, status: 'Still needed: 3 criteria' },
        { ready: false, status: 'Still needed: a proposed increment, 5 criteria' },
      ],
      submitLabel: 'Submit to Sirius HR',
      caption: 'Complete every employee to submit.',
    });
  });

  it('marks complete employees ready, and says submitting comes later when all are', () => {
    const draft = request();
    const [omar] = draft.lines;
    const complete = (omar?.criteria ?? []).map((c) => ({
      ...c,
      missing: [] as CriterionMissing[],
    }));
    const ready = request({
      lines: [
        {
          ...must(omar),
          criteria: complete.slice(0, 4).concat([{ ...must(complete[4]), missing: ['result'] }]),
        },
      ],
      totals: { ...draft.totals, employees: 1, ready: 1 },
    });
    expect(readyView(ready, 'en', t).items[0]?.status).toBe('Still needed: 1 criterion');
    const allDone = request({
      lines: [{ ...must(omar), criteria: complete }],
      totals: { ...draft.totals, employees: 1, ready: 1 },
    });
    expect(readyView(allDone, 'en', t)).toMatchObject({
      items: [{ ready: true, status: 'Ready' }],
      caption: 'Submitting to Sirius HR is not available yet.',
    });
  });
});

describe('totalsView', () => {
  it('shows totals per currency and the average', () => {
    const totals = totalsView(request(), 'en', t);
    expect(totals.employees).toBe('2');
    expect(totals.increase).toMatch(/^AED\s1,720 \/ month \+ USD\s250\.50 \/ month$/u);
    expect(totals.average).toBe('6.6%');
  });

  it('says "Not set" before any proposal', () => {
    const empty = request({
      totals: { employees: 0, proposed: 0, ready: 0, increaseByCurrency: [], averagePercent: null },
    });
    expect(totalsView(empty, 'en', t)).toEqual({
      employees: '0',
      increase: 'Not set',
      average: 'Not set',
    });
  });
});

describe('labels and messages', () => {
  it('translates table labels and every save message', () => {
    expect(tableLabels(t)).toMatchObject({ colCurrent: 'Current monthly', saving: 'Saving…' });
    const messages = new Map(saveMessages(t));
    expect(messages.get('request.errors.overLimit')).toMatch(/at most 100%/u);
    expect(messages.get('request.errors.stale')).toMatch(/another window/u);
  });

  it('pluralises "employees added"', () => {
    expect(employeesAdded(1, 'en', t)).toBe('1 employee added');
    expect(employeesAdded(4, 'en', t)).toBe('4 employees added');
  });
});
