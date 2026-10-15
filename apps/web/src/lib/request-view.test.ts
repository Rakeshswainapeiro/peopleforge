import type { CriterionMissing, IncrementRequest, RequestLine } from '@peopleforge/contracts';
import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { draftRequest, LINE_1, must, notStarted, REQUEST_ID } from '@/test-support/requests';
import {
  criteriaCards,
  criteriaLabels,
  employeesAdded,
  evidenceMessages,
  progressSteps,
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
      required: true,
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
      labels: {
        attach: 'Attach File',
        attachFor: 'Attach a file for C1',
        // Figma: "PDF, JPG, PNG, XLSX · max 10 MB *".
        rules: 'PDF, PNG, JPG, XLSX · max 10 MB',
        required: 'Evidence required',
      },
    });
    expect(c2?.evidence?.files[0]?.meta).toBe('PNG · 3 MB');
    expect(c3?.missingText).toBe('To complete: add a justification, attach evidence.');
    expect(c5?.evidence?.required).toBe(false);
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
    expect(
      criteriaCards(csvOnly, must(csvOnly.lines[0]), 'en', t)[0]?.evidence?.labels.rules,
    ).toMatch(/^text\/csv · /u);
  });

  it('treats a criterion the API left out as not started (version skew)', () => {
    const draft = request();
    const line = { ...must(draft.lines[1]), criteria: [notStarted('x')] };
    const [, second] = criteriaCards(draft, line, 'en', t);
    expect(second).toMatchObject({
      result: null,
      justification: '',
      complete: false,
      missingText: 'To complete: choose Pass or Fail, add a justification, attach evidence.',
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
    expect(criteriaLabels(t)).toEqual({
      pass: 'Pass',
      fail: 'Fail',
      justification: 'Justification',
      justificationPlaceholder: 'Why does this employee pass or fail this criterion?',
    });
    expect(new Map(evidenceMessages(t)).get('evidence.errors.infected')).toMatch(/malware/u);
  });
});

describe('readyView', () => {
  const allComplete = (line: RequestLine) =>
    line.criteria.map((c) => ({ ...c, missing: [] as CriterionMissing[] }));

  it('lists each employee as in the Figma, and why submitting is blocked', () => {
    expect(readyView(request(), 'en', t, 'key-1')).toEqual({
      items: [
        { lineId: LINE_1, fullName: 'Omar Haddad', ready: false, status: '3 criteria incomplete' },
        {
          lineId: must(request().lines[1]).id,
          fullName: 'Neha Iyer',
          ready: false,
          status: '5 criteria incomplete · no proposed increment',
        },
      ],
      note: '2 of 2 employees still have incomplete criteria. Submit unlocks when every employee is 5/5.',
      canSubmit: false,
      submitKey: 'key-1',
      submitLabels: {
        submit: 'Submit to Sirius HR',
        submitting: 'Submitting…',
        cancel: 'Cancel',
        title: 'Submit INC-2026-0001 to Sirius HR?',
        body: '2 employees go to Sirius HR for review. You can’t edit the request afterwards.',
        unsaved: 'Anything you changed on this page is saved first.',
      },
      caption:
        'On submit the request is routed to Sirius HR, its status becomes Submitted, and both sides get an email and in-app notification.',
    });
  });

  it('says one criterion in the singular', () => {
    const draft = request();
    const omar = must(draft.lines[0]);
    const criteria = allComplete(omar);
    criteria[4] = { ...must(criteria[4]), missing: ['result'] };
    const one = request({ lines: [{ ...omar, criteria }] });
    expect(readyView(one, 'en', t, 'key-1').items[0]?.status).toBe('1 criterion incomplete');
  });

  it('points at missing proposals once every criterion is complete', () => {
    const draft = request();
    const omar = must(draft.lines[0]);
    const neha = must(draft.lines[1]);
    const view = readyView(
      request({
        lines: [
          { ...omar, criteria: allComplete(omar) },
          { ...neha, criteria: allComplete(neha) },
        ],
      }),
      'en',
      t,
      'key-1',
    );
    expect(view.items.map((item) => [item.ready, item.status])).toEqual([
      [true, 'All 5 criteria complete'],
      [false, 'no proposed increment'],
    ]);
    expect(view.note).toBe(
      '1 of 2 employees have no proposed increment yet. Submit unlocks when every employee has one.',
    );
  });

  it('says when everyone is ready, and lets them submit', () => {
    const omar = must(request().lines[0]);
    const one = readyView(
      request({
        lines: [{ ...omar, criteria: allComplete(omar) }],
        totals: { ...request().totals, ready: 1 },
      }),
      'en',
      t,
      'key-1',
    );
    expect(one.canSubmit).toBe(true);
    expect(one.submitLabels.body).toBe(
      '1 employee goes to Sirius HR for review. You can’t edit the request afterwards.',
    );
    expect(readyView(request({ lines: [] }), 'en', t, 'k').canSubmit).toBe(false);
    expect(
      readyView(request({ lines: [{ ...omar, criteria: allComplete(omar) }] }), 'en', t, 'key-1')
        .note,
    ).toBe('Every employee is ready to submit.');
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

describe('progressSteps', () => {
  it('waits at "Submitted" for a draft, and at Review once submitted', () => {
    expect(progressSteps(request(), 'en', t).map((step) => [step.state, step.detail])).toEqual([
      ['done', '14 Oct 2026'],
      ['current', 'Pending'],
      ['todo', 'Pending'],
      ['todo', 'Pending'],
    ]);
    const submitted = request({ status: 'submitted', submittedAt: '2026-10-15T06:00:00.000Z' });
    expect(progressSteps(submitted, 'en', t).map((step) => [step.label, step.state])).toEqual([
      ['Added to request', 'done'],
      ['Submitted to Sirius HR', 'done'],
      ['Review in progress', 'current'],
      ['Decision', 'todo'],
    ]);
    expect(progressSteps(submitted, 'en', t)[1]?.detail).toBe('15 Oct 2026');
  });
});
