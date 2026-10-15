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
  ALL_PERIODS,
  cycleFilter,
  dashboardHref,
  dashboardState,
  draftActions,
  kpiCards,
  lineRows,
  periodOptions,
  requestRows,
  stageView,
  statusOptions,
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
      }),
    ).toEqual({
      view: 'employees',
      cycle: CYCLE_ID,
      status: 'submitted',
      search: 'Omar',
      requestId: REQUEST_ID,
      page: 3,
      pageSize: 25,
    });
    expect(dashboardState({ cycle: ALL_PERIODS }).cycle).toBe(ALL_PERIODS);
  });

  it('falls back to defaults for anything it doesn’t recognise, and takes the first of repeats', () => {
    expect(
      dashboardState({
        view: 'kanban',
        cycle: 'Q3-2026',
        status: 'approved',
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
    });
    expect(dashboardState({ view: ['employees', 'requests'], page: ['2', '9'] })).toMatchObject({
      view: 'employees',
      page: 2,
    });
    expect(dashboardState({ q: '   ' }).search).toBeUndefined();
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
    expect(statusOptions(t)).toEqual([
      { value: '', label: 'All statuses' },
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
    ]);
  });
});

describe('kpiCards', () => {
  it('shows subsidiary HR five cards and Sirius HR four (no drafts)', () => {
    const cards = kpiCards(dashboardSummaryFixture(), false, 'en', t);
    expect(cards.map((card) => [card.label, card.value, card.hint])).toEqual([
      ['Drafts', '1', 'Not yet submitted'],
      ['With Sirius HR', '2', 'Submitted or under review'],
      ['Needs your reply', '0', 'Clarification requested'],
      ['Approved', '0', '0 full, 0 partly'],
      ['Rejected', '0', 'This cycle'],
    ]);
    expect(kpiCards(dashboardSummaryFixture(), true, 'en', t).map((card) => card.label)).toEqual([
      'With Sirius HR',
      'Needs your reply',
      'Approved',
      'Rejected',
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
      href: `/requests/${REQUEST_ID}`,
      entityCode: 'SUB-A',
      created: '8 Oct 2026',
      employees: '4',
      employeesHref: `/?view=employees&request=${REQUEST_ID}`,
      employeesLabel: 'View the employees of INC-2026-0150',
      stage: { filled: 0, total: 5, label: 'Not submitted' },
      status: { tone: 'outline', label: 'Draft' },
      age: '2d',
      with: 'You',
    });
    expect(submitted).toMatchObject({
      stage: { label: 'Criterion 1 of 5' },
      status: { tone: 'neutral', label: 'Submitted' },
      age: '0d',
      with: 'Sirius HR',
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
      status: { tone: 'neutral', label: 'Submitted' },
      updated: '10 Oct 2026',
      viewLabel: 'View the status of Omar Haddad',
    });
    expect(unproposed).toMatchObject({ proposed: 'Not proposed', marksLabel: '' });
  });
});

describe('draftActions', () => {
  it('says how far each draft has got', () => {
    expect(draftActions(requestPage(), 'en', t)).toEqual([
      {
        id: REQUEST_ID,
        title: 'INC-2026-0150 · Draft not submitted',
        detail: '4 employees added · criteria 15 of 20 complete',
        href: `/requests/${REQUEST_ID}`,
      },
    ]);
  });
});
