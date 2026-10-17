import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import {
  CYCLE_ID,
  dashboardSummaryFixture,
  LINE_1,
  linePage,
  lineSummary,
  OPEN_CYCLE,
  REQUEST_ID,
  requestPage,
  requestSummary,
} from '@/test-support/requests';
import {
  ACTION_OVERDUE_DAYS,
  ACTION_ROWS,
  ALL_PERIODS,
  actionRows,
  cycleFilter,
  dashboardHref,
  dashboardState,
  entityOptions,
  kpiCards,
  lineRows,
  periodOptions,
  requestRows,
  stageView,
  statusOptions,
  withWhom,
  type DashboardState,
} from './dashboard-view';

const t = createTranslator('en');
const DEFAULT: DashboardState = { view: 'requests', page: 1, pageSize: 10 };

describe('dashboardState [R1-10]', () => {
  it('reads every filter from the URL', () => {
    expect(
      dashboardState({
        view: 'employees',
        cycle: CYCLE_ID,
        status: 'submitted',
        q: '  Omar ',
        request: REQUEST_ID,
        page: '3',
        size: '25',
        show: 'drafts',
      }),
    ).toEqual({
      view: 'employees',
      cycle: CYCLE_ID,
      status: 'submitted',
      search: 'Omar',
      requestId: REQUEST_ID,
      page: 3,
      pageSize: 25,
      show: 'drafts',
    });
    expect(dashboardState({ cycle: ALL_PERIODS }).cycle).toBe(ALL_PERIODS);
  });

  it('falls back to defaults for anything it doesn’t recognise, and takes the first of repeats', () => {
    expect(
      dashboardState({
        view: 'kanban',
        cycle: 'Q3-2026',
        status: 'archived',
        q: 'x'.repeat(101),
        request: REQUEST_ID, // only meaningful By employee
        page: '-1',
        size: '1000',
      }),
    ).toEqual({
      ...DEFAULT,
      cycle: undefined,
      status: undefined,
      search: undefined,
      requestId: undefined,
      entity: undefined,
      show: undefined,
    });
    expect(dashboardState({ view: ['employees', 'requests'], page: ['2', '9'] })).toMatchObject({
      view: 'employees',
      page: 2,
    });
    expect(dashboardState({ q: '   ' }).search).toBeUndefined();
    expect(dashboardState({ show: 'questions' }).show).toBeUndefined();
  });
});

describe('dashboardHref', () => {
  it('keeps the state, applies changes, leaves out defaults and goes back to page 1', () => {
    const state = dashboardState({
      cycle: ALL_PERIODS,
      status: 'draft',
      q: 'Omar & co',
      page: '4',
      size: '50',
    });
    expect(dashboardHref(DEFAULT)).toBe('/');
    expect(dashboardHref(state)).toBe('/?cycle=all&status=draft&q=Omar+%26+co&size=50');
    expect(dashboardHref(state, { page: 2 })).toBe(
      '/?cycle=all&status=draft&q=Omar+%26+co&page=2&size=50',
    );
    expect(dashboardHref(state, { view: 'employees', requestId: REQUEST_ID, pageSize: 10 })).toBe(
      `/?view=employees&cycle=all&status=draft&q=Omar+%26+co&request=${REQUEST_ID}`,
    );
    expect(dashboardHref(DEFAULT, { show: 'drafts' })).toBe('/?show=drafts');
    // A request filter only exists By employee.
    expect(dashboardHref({ ...DEFAULT, requestId: REQUEST_ID })).toBe('/');
  });
});

describe('cycleFilter / periodOptions / statusOptions', () => {
  it('uses the chosen cycle, none for All periods, else the first open cycle', () => {
    expect(cycleFilter({ ...DEFAULT, cycle: REQUEST_ID }, [OPEN_CYCLE])).toBe(REQUEST_ID);
    expect(cycleFilter({ ...DEFAULT, cycle: ALL_PERIODS }, [OPEN_CYCLE])).toBeUndefined();
    expect(cycleFilter(DEFAULT, [OPEN_CYCLE])).toBe(CYCLE_ID);
    expect(cycleFilter(DEFAULT, [])).toBeUndefined();
  });

  it('offers the open cycles then All periods, and All statuses then each status', () => {
    expect(periodOptions([OPEN_CYCLE], 'en', t)).toEqual([
      { value: CYCLE_ID, label: 'Increment cycle 2026' },
      { value: 'all', label: 'All periods' },
    ]);
    expect(statusOptions(t).map((option) => option.label)).toEqual([
      'All statuses',
      'Draft',
      'Submitted',
      'Under review',
      'Returned',
      'Approved',
      'Partly approved',
      'Rejected',
    ]);
    // Sirius HR never sees drafts.
    expect(statusOptions(t, true).map((option) => option.value)).not.toContain('draft');
  });

  it('offers All subsidiaries then each subsidiary by code [R1-10]', () => {
    expect(entityOptions([{ id: REQUEST_ID, code: 'SUB-A' }], t)).toEqual([
      { value: '', label: 'All subsidiaries' },
      { value: REQUEST_ID, label: 'SUB-A' },
    ]);
  });
});

describe('kpiCards', () => {
  it('shows subsidiary HR five cards and Sirius HR four (no drafts)', () => {
    const cards = kpiCards(dashboardSummaryFixture(), false, 'en', t);
    expect(cards.map((card) => [card.label, card.value, card.hint])).toEqual([
      ['Drafts', '1', 'Not yet submitted'],
      ['With Sirius HR', '3', 'Submitted or under review'],
      ['Needs your reply', '1', 'Clarification requested'],
      ['Approved', '3', '2 full, 1 partly'],
      ['Rejected', '1', 'This cycle'],
    ]);
    expect(
      kpiCards(dashboardSummaryFixture(), true, 'en', t).map((card) => [card.label, card.value]),
    ).toEqual([
      ['To review', '3'],
      ['Returned to subsidiaries', '1'],
      ['Approved', '3'],
      ['Rejected', '1'],
    ]);
  });
});

describe('stageView', () => {
  it('words the stage and fills the bar to match', () => {
    expect(stageView({ kind: 'not_submitted', of: 5 }, 'en', t)).toEqual({
      filled: 0,
      total: 5,
      label: 'Not submitted',
    });
    expect(stageView({ kind: 'criterion', criterion: 1, of: 5 }, 'en', t)).toEqual({
      filled: 1,
      total: 5,
      label: 'Criterion 1 of 5',
    });
    expect(stageView({ kind: 'decision', of: 5 }, 'en', t)).toEqual({
      filled: 5,
      total: 5,
      label: 'Awaiting decision',
    });
    expect(stageView({ kind: 'decided', of: 5 }, 'en', t).label).toBe('Decided');
  });
});

describe('withWhom [R1-10]', () => {
  it.each([
    ['draft', false, 'You'],
    ['draft', true, 'SUB-A'],
    ['returned', false, 'You'],
    ['returned', true, 'SUB-A'],
    ['submitted', true, 'Sirius HR'],
    ['under_review', false, 'Sirius HR'],
    ['approved', true, 'Closed'],
    ['partly_approved', false, 'Closed'],
    ['rejected', true, 'Closed'],
  ] as const)('%s (group %s) is with %s', (status, group, holder) => {
    expect(withWhom(status, 'SUB-A', group, t)).toBe(holder);
  });
});

describe('requestRows', () => {
  it('labels each request with its stage, status, age and who has it', () => {
    const now = new Date('2026-10-10T08:00:00Z');
    const [draft, submitted] = requestRows(
      requestPage([
        requestSummary(),
        requestSummary({
          id: '11111111-1111-4111-8111-111111111112',
          reference: 'INC-2026-0152',
          status: 'submitted',
          employeeCount: 3,
          submittedAt: '2026-10-10T06:00:00.000Z',
          statusChangedAt: '2026-10-10T06:00:00.000Z',
          stage: { kind: 'criterion', criterion: 1, of: 5 },
        }),
      ]),
      DEFAULT,
      now,
      'en',
      t,
    );
    expect(draft).toEqual({
      id: REQUEST_ID,
      reference: 'INC-2026-0150',
      // A draft opens in the editor.
      href: `/requests/${REQUEST_ID}/edit`,
      entityCode: 'SUB-A',
      created: '8 Oct 2026',
      employees: '4',
      employeesHref: `/?view=employees&request=${REQUEST_ID}`,
      employeesLabel: 'View the employees of INC-2026-0150',
      stage: { filled: 0, total: 5, label: 'Not submitted' },
      status: { tone: 'outline', label: 'Draft' },
      age: '2d',
      with: 'You',
      submitted: '—',
    });
    expect(submitted).toMatchObject({
      href: '/requests/11111111-1111-4111-8111-111111111112',
      stage: { label: 'Criterion 1 of 5' },
      status: { tone: 'neutral', label: 'Submitted' },
      age: '0d',
      with: 'Sirius HR',
      submitted: '10 Oct 2026',
    });
  });
});

describe('lineRows', () => {
  it('shows the proposal as a percentage, the marks with a spoken summary, and View Status', () => {
    const [row, unproposed] = lineRows(
      linePage([
        lineSummary(),
        lineSummary({ proposedPercent: null, status: 'draft', criteria: [] }),
      ]),
      'en',
      t,
    );
    expect(row).toEqual({
      id: LINE_1,
      href: `/requests/${REQUEST_ID}/employees/${LINE_1}`,
      name: 'Omar Haddad',
      detail: 'EMP-3318 · G7 · INC-2026-0152',
      entityCode: 'SUB-A',
      proposed: '8%',
      marks: [
        { code: 'C1', state: 'pass' },
        { code: 'C2', state: 'pass' },
        { code: 'C3', state: 'pass' },
        { code: 'C4', state: 'pass' },
        { code: 'C5', state: 'fail' },
      ],
      marksLabel: 'C1 pass, C2 pass, C3 pass, C4 pass, C5 fail',
      status: { tone: 'neutral', label: 'With Sirius HR' },
      updated: '10 Oct 2026',
      viewLabel: 'View the status of Omar Haddad',
    });
    expect(unproposed).toMatchObject({ proposed: 'Not proposed', marksLabel: '' });
    // Sirius HR sees each employee's own status (R1-09).
    const [approved] = lineRows(
      linePage([
        lineSummary({
          request: { ...lineSummary().request, status: 'partly_approved' },
          reviewStatus: 'approved',
        }),
      ]),
      'en',
      t,
      true,
    );
    expect(approved?.status).toEqual({ tone: 'brand', label: 'Approved' });
  });
});

describe('actionRows', () => {
  it('lists each draft with what it needs and how long it has waited', () => {
    const now = new Date('2026-10-10T08:00:00Z');
    expect(actionRows(requestPage().items, now, 'en', t)).toEqual([
      {
        id: REQUEST_ID,
        type: { tone: 'outline', label: 'Draft' },
        primary: '4 employees',
        secondary: 'INC-2026-0150',
        needed: 'Complete and submit',
        neededDetail: 'Criteria 15 of 20 complete',
        waiting: '2d',
        overdue: false,
        href: `/requests/${REQUEST_ID}/edit`,
        action: 'Continue draft',
      },
    ]);
  });

  it(`lists at most ${String(ACTION_ROWS)}, the API's page being larger`, () => {
    const many = requestPage(
      Array.from({ length: 7 }, (_, index) =>
        requestSummary({ id: `11111111-1111-4111-8111-11111111111${String(index)}` }),
      ),
    );
    expect(actionRows(many.items, new Date('2026-10-10T08:00:00Z'), 'en', t)).toHaveLength(
      ACTION_ROWS,
    );
  });

  it(`flags a draft waiting ${String(ACTION_OVERDUE_DAYS)} days or more, and counts one employee`, () => {
    const page = requestPage([
      requestSummary({ employeeCount: 1, statusChangedAt: '2026-10-05T07:00:00.000Z' }),
    ]);
    const [row] = actionRows(page.items, new Date('2026-10-10T08:00:00Z'), 'en', t);
    expect(row).toMatchObject({ primary: '1 employee', waiting: '5d', overdue: true });
    const [fresh] = actionRows(page.items, new Date('2026-10-09T08:00:00Z'), 'en', t);
    expect(fresh).toMatchObject({ waiting: '4d', overdue: false });
  });
});

describe('actionRows with returns [R1-08]', () => {
  it('lists returns beside drafts, longest waiting first, with Respond', () => {
    const now = new Date('2026-10-10T08:00:00Z');
    const rows = actionRows(
      [
        requestSummary(),
        requestSummary({
          id: '11111111-1111-4111-8111-111111111119',
          reference: 'INC-2026-0152',
          status: 'returned',
          statusChangedAt: '2026-10-07T07:00:00.000Z',
          stage: { kind: 'criterion', criterion: 3, of: 5 },
        }),
      ],
      now,
      'en',
      t,
    );
    expect(rows.map((row) => row.secondary)).toEqual(['INC-2026-0152', 'INC-2026-0150']);
    expect(rows[0]).toMatchObject({
      type: { tone: 'warning', label: 'Returned' },
      needed: 'Answer Sirius HR and resubmit',
      neededDetail: 'Criterion 3 of 5',
      href: '/requests/11111111-1111-4111-8111-111111111119/edit',
      action: 'Respond',
    });
  });
});

describe('dashboardState with a subsidiary and returns', () => {
  it('reads the subsidiary and the Returned choice, and links them back', () => {
    const state = dashboardState({ entity: REQUEST_ID, show: 'returned' });
    expect(state).toMatchObject({ entity: REQUEST_ID, show: 'returned' });
    expect(dashboardHref(state)).toBe(`/?entity=${REQUEST_ID}&show=returned`);
    expect(dashboardState({ entity: 'SUB-A', show: 'x' })).toMatchObject({
      entity: undefined,
      show: undefined,
    });
  });
});
