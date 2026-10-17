import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import {
  decisionOf,
  draftRequest,
  LINE_1,
  LINE_2,
  REQUEST_ID,
  submittedRequest,
} from '@/test-support/requests';
import {
  criteriaColumn,
  detailRows,
  detailSubtitle,
  returnedView,
  reviewSteps,
  submittedBanner,
} from './request-detail-view';

const t = createTranslator('en');

describe('detailSubtitle', () => {
  it('says when, by whom, for which subsidiary, and who has it (Dubai time)', () => {
    expect(detailSubtitle(submittedRequest(), 'en', t)).toBe(
      'Submitted 15 Oct 2026, 11:14 by Priya Nair · Subsidiary A · With Sirius HR',
    );
  });

  it('leaves out the name for requests submitted before it was kept', () => {
    expect(detailSubtitle(submittedRequest({ submittedByName: null }), 'en', t)).toBe(
      'Submitted 15 Oct 2026, 11:14 · Subsidiary A · With Sirius HR',
    );
  });

  it('falls back to the creation time without a submission time', () => {
    expect(detailSubtitle(draftRequest(), 'en', t)).toBe(
      'Submitted 14 Oct 2026, 11:00 · Subsidiary A · With Sirius HR',
    );
  });
});

describe('submittedBanner [R1-07]', () => {
  it('says what went and what happens next', () => {
    const banner = submittedBanner(submittedRequest(), 'en', t);
    expect(banner.title).toBe('INC-2026-0152 submitted to Sirius HR');
    expect(banner.body).toMatch(
      /^2 employees · AED\s1,720 per month · Status: Submitted · Next: Sirius HR reviews Criterion 1 of 5\./u,
    );
  });

  it('counts one employee in the singular', () => {
    const request = submittedRequest();
    const one = { ...request, lines: request.lines.slice(0, 1) };
    expect(submittedBanner(one, 'en', t).body).toMatch(/^1 employee · /u);
  });
});

describe('reviewSteps [R1-10]', () => {
  it('is done at Submitted and waits at Criterion 1 once submitted', () => {
    expect(
      reviewSteps(submittedRequest(), 'en', t).map((step) => [step.label, step.detail, step.state]),
    ).toEqual([
      ['Submitted', 'Done · 15 Oct 2026', 'done'],
      ['Criterion 1', 'Sirius HR reviewing', 'current'],
      ['Criterion 2', 'Pending', 'todo'],
      ['Criterion 3', 'Pending', 'todo'],
      ['Criterion 4', 'Pending', 'todo'],
      ['Criterion 5', 'Pending', 'todo'],
      ['Decision', 'Pending', 'todo'],
    ]);
  });

  it('waits at Submitted while a draft', () => {
    const steps = reviewSteps(draftRequest(), 'en', t);
    expect(steps[0]).toEqual({ label: 'Submitted', detail: 'Pending', state: 'current' });
    expect(steps[1]?.state).toBe('todo');
  });
});

describe('detailRows', () => {
  it('shows salary, proposal, marks, status and View Status per employee', () => {
    const [omar, neha] = detailRows(submittedRequest(), 'en', t);
    expect(omar).toMatchObject({
      id: LINE_1,
      name: 'Omar Haddad',
      number: 'EMP-3318',
      grade: 'G7',
      percent: '8%',
      marks: [
        { code: 'C1', state: 'pass' },
        { code: 'C2', state: 'fail' },
        { code: 'C3', state: 'pass' },
        { code: 'C4', state: 'pass' },
        { code: 'C5', state: 'pass' },
      ],
      marksLabel: 'C1 pass, C2 fail, C3 pass, C4 pass, C5 pass',
      status: { tone: 'neutral', label: 'With Sirius HR' },
      href: `/requests/${REQUEST_ID}/employees/${LINE_1}`,
      viewLabel: 'View the status of Omar Haddad',
    });
    expect(omar?.current).toMatch(/^AED\s21,500$/u);
    expect(omar?.increase).toMatch(/^\+ AED\s1,720$/u);
    expect(neha).toMatchObject({ id: LINE_2, percent: 'Not set', increase: null });
  });

  it('marks criteria not complete yet as such', () => {
    const [omar] = detailRows(draftRequest(), 'en', t);
    expect(omar?.marks.map((mark) => mark.state)).toEqual([
      'pass',
      'fail',
      'pending',
      'pending',
      'pending',
    ]);
  });
});

describe('criteriaColumn', () => {
  it('names the criteria range, or just "Criteria" without any', () => {
    expect(criteriaColumn(submittedRequest(), t)).toBe('Criteria C1–C5');
    expect(criteriaColumn(submittedRequest({ criteria: [] }), t)).toBe('Criteria');
  });
});

describe('review in the request detail [R1-08 … R1-10]', () => {
  it('says who has the request: the subsidiary when returned, nobody once decided', () => {
    expect(detailSubtitle(submittedRequest({ status: 'returned' }), 'en', t)).toMatch(
      / · With Subsidiary A$/u,
    );
    expect(
      detailSubtitle(
        submittedRequest({ status: 'approved', decidedAt: '2026-10-16T09:00:00.000Z' }),
        'en',
        t,
      ),
    ).toMatch(/ · Decided 16 Oct 2026$/u);
  });

  it('marks criteria verified for everyone done, the next current, then the decision', () => {
    const at = (stage: Parameters<typeof reviewSteps>[0]['stage'], extra = {}) =>
      reviewSteps(submittedRequest({ stage, ...extra }), 'en', t).map((step) => step.state);
    expect(at({ kind: 'criterion', criterion: 3, of: 5 })).toEqual([
      'done',
      'done',
      'done',
      'current',
      'todo',
      'todo',
      'todo',
    ]);
    const deciding = reviewSteps(submittedRequest({ stage: { kind: 'decision', of: 5 } }), 'en', t);
    expect(deciding.at(-1)).toEqual({
      label: 'Decision',
      detail: 'Awaiting decision',
      state: 'current',
    });
    expect(deciding[1]?.detail).toBe('Verified for everyone');
    const decided = reviewSteps(
      submittedRequest({
        status: 'partly_approved',
        stage: { kind: 'decided', of: 5 },
        decidedAt: '2026-10-16T09:00:00.000Z',
      }),
      'en',
      t,
    );
    expect(decided.at(-1)).toEqual({
      label: 'Decision',
      detail: 'Partly approved · 16 Oct 2026',
      state: 'done',
    });
  });

  it('shows each employee’s own status for Sirius HR', () => {
    const request = submittedRequest({ status: 'returned' });
    const [omar] = detailRows(
      {
        ...request,
        lines: request.lines.map((line) => ({ ...line, reviewStatus: 'returned' as const })),
      },
      'en',
      t,
      true,
    );
    expect(omar?.status).toEqual({ tone: 'warning', label: 'Returned' });
  });

  it('lists returned employees with Sirius HR’s reason and question, or nothing', () => {
    const request = submittedRequest({ status: 'returned' });
    expect(returnedView(submittedRequest(), 'en', t, false)).toBeNull();
    const returned = {
      ...request,
      lines: request.lines.map((line, index) =>
        index === 0
          ? {
              ...line,
              reviewStatus: 'returned' as const,
              decision: decisionOf({
                decision: 'returned',
                reasonCode: 'missing_evidence',
                comment: 'Attach the appraisal.',
              }),
            }
          : line,
      ),
    };
    expect(returnedView(returned, 'en', t, false)).toEqual({
      title: 'Sirius HR returned 1 employee to you',
      body: 'Answer each question, update the employee and resubmit. Employees not returned stay with Sirius HR.',
      items: [
        {
          id: LINE_1,
          name: 'Omar Haddad',
          reason: 'Missing evidence',
          comment: 'Attach the appraisal.',
        },
      ],
    });
    const both = {
      ...request,
      lines: request.lines.map((line) => ({ ...line, reviewStatus: 'returned' as const })),
    };
    const view = returnedView(both, 'en', t, true);
    expect(view?.title).toBe('2 employees are back with Subsidiary A');
    expect(view?.items[1]).toEqual({ id: LINE_2, name: 'Neha Iyer', reason: '', comment: '' });
  });
});
