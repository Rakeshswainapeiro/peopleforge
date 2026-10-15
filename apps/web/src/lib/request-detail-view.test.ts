import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import {
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
      status: { tone: 'neutral', label: 'Submitted' },
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
