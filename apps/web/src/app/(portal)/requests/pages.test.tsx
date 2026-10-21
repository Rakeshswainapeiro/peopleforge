import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import type { ApiResult } from '@/server/api-client';
import { getHistory, getRequest, openCycles, searchEmployees } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import {
  auditEvent,
  decisionOf,
  draftRequest,
  EVIDENCE_ID,
  LINE_1,
  LINE_2,
  must,
  submittedRequest,
} from '@/test-support/requests';
import EditRequestPage from './[id]/edit/page';
import RequestDetailPage from './[id]/page';
import NewRequestPage from './new/page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({
  getHistory: vi.fn(),
  getRequest: vi.fn(),
  openCycles: vi.fn(),
  searchEmployees: vi.fn(),
}));
vi.mock('./actions', () => ({
  startRequest: vi.fn(),
  addEmployeeAction: vi.fn(),
  removeEmployeeAction: vi.fn(),
  saveDraft: vi.fn(),
  uploadEvidenceAction: vi.fn(),
  removeEvidenceAction: vi.fn(),
}));
vi.mock('@/app/(portal)/review/actions', () => ({ decideAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const SUB_A = '00000000-0000-4000-8000-0000000e000a';
const SUB_B = '00000000-0000-4000-8000-0000000e000b';
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const REQUEST = '11111111-1111-4111-8111-111111111111';

const ALPHA_HR: Me = {
  userId: 'alpha',
  username: 'pf.alpha.hr',
  name: 'Alpha HR',
  roles: ['PeopleForge.SubsidiaryHR'],
  scope: 'entity',
  entityIds: [SUB_A],
  permissions: ['increment_request:read', 'increment_request:create'],
  entities: [{ id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } }],
};

const cycle = (id = CYCLE, name = 'Increment cycle 2026') => ({
  id,
  name: { en: name },
  startsOn: '2026-01-01',
  endsOn: '2026-12-31',
  submissionDeadline: null,
  status: 'open' as const,
});

const DRAFT = draftRequest({ reference: 'INC-2026-0007' });

const employees = {
  kind: 'ok' as const,
  data: [
    {
      id: '33333333-3333-4333-8333-333333333332',
      employeeNumber: 'EMP-1102',
      fullName: 'Yusuf Karim',
      grade: 'G6',
    },
  ],
};

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(ALPHA_HR);
  vi.mocked(openCycles).mockResolvedValue({ kind: 'ok', data: [cycle()] });
  vi.mocked(searchEmployees).mockResolvedValue(employees);
  vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: DRAFT });
});

const newPage = (query: Record<string, string> = {}) =>
  NewRequestPage({ searchParams: Promise.resolve(query) });
const requestPage = (id = REQUEST, query: Record<string, string> = {}) =>
  EditRequestPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) });
const detailPage = (id = REQUEST, query: Record<string, string> = {}) =>
  RequestDetailPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) });

const SIRIUS_REVIEWER: Me = {
  ...ALPHA_HR,
  userId: 'reviewer',
  roles: ['PeopleForge.SiriusReviewer'],
  scope: 'group',
  entityIds: [],
  permissions: ['increment_request:read'],
};

describe('New increment request page [R1-02]', () => {
  it('offers the subsidiary’s employees for the open cycle', async () => {
    const { container } = render(await newPage());
    expect(
      screen.getByRole('heading', { level: 1, name: 'New increment request' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Only Subsidiary A employees can be added. Each employee can appear once.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Yusuf Karim · EMP-1102 · G6' })).toBeInTheDocument();
    expect(container.querySelector('input[name="cycleId"]')).toHaveValue(CYCLE);
    expect(container.querySelector('input[name="entityId"]')).toHaveValue(SUB_A);
    expect(container.querySelector('input[name="idempotencyKey"]')?.getAttribute('value')).toMatch(
      /^[0-9a-f-]{36}$/u,
    );
    expect(screen.getByText('No employees yet')).toBeInTheDocument();
    expect(searchEmployees).toHaveBeenCalledWith(SUB_A);
  });

  it('lets the user choose between several open cycles and subsidiaries', async () => {
    vi.mocked(openCycles).mockResolvedValue({
      kind: 'ok',
      data: [cycle(), cycle('00000000-0000-4000-8000-00000000c027', 'Interim 2027')],
    });
    vi.mocked(requireViewer).mockResolvedValue({
      ...ALPHA_HR,
      entityIds: [SUB_A, SUB_B],
      entities: [...ALPHA_HR.entities, { id: SUB_B, code: 'SUB-B', name: { en: 'Subsidiary B' } }],
    });
    render(await newPage({ entity: SUB_B }));
    expect(screen.getByRole('combobox', { name: 'Increment cycle' })).toHaveValue(CYCLE);
    expect(screen.getByRole('link', { name: 'Subsidiary B' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(searchEmployees).toHaveBeenCalledWith(SUB_B);
  });

  it('shows a known error from the URL and ignores unknown ones', async () => {
    render(await newPage({ error: 'request.errors.cycleNotOpen' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That increment cycle is not open.');
    render(await newPage({ error: '<b>hi</b>' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('explains when no cycle is open or no subsidiary is assigned', async () => {
    vi.mocked(openCycles).mockResolvedValue({ kind: 'ok', data: [] });
    render(await newPage());
    expect(screen.getByText('No increment cycle is open')).toBeInTheDocument();
    vi.mocked(requireViewer).mockResolvedValue({ ...ALPHA_HR, entityIds: [], entities: [] });
    render(await newPage());
    expect(screen.getByText('No subsidiary assigned')).toBeInTheDocument();
  });

  it('answers not found without the create permission, and nothing while the API is down', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...ALPHA_HR,
      permissions: ['increment_request:read'],
    });
    await expect(newPage()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(newPage()).resolves.toBeNull();
  });

  it.each([
    [{ kind: 'unauthenticated' }, 'NEXT_REDIRECT /session-ended'],
    [{ kind: 'unavailable' }, 'Increment request API unavailable'],
  ])('handles lookups that fail (%j)', async (result, message) => {
    vi.mocked(searchEmployees).mockResolvedValue(result as ApiResult<never>);
    await expect(newPage()).rejects.toThrow(message);
  });
});

describe('Draft editor [R1-02]', () => {
  it('shows the draft with totals, the employee picker and Save draft', async () => {
    render(await requestPage());
    expect(
      screen.getByRole('heading', { level: 1, name: 'New increment request' }),
    ).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'My requests' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(breadcrumb).toHaveTextContent('INC-2026-0007 · Draft');
    expect(
      screen.getByText(
        'Add employees, propose an increment, then complete all 5 criteria for each one.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Criteria' })).toBeInTheDocument();
    expect(screen.getByText('2/5 complete')).toBeInTheDocument();
    expect(screen.getByText('0/5 complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    expect(screen.getByTestId('total-increase')).toHaveTextContent(/^AED\s1,720 \/ month$/u);
    expect(screen.getByTestId('average-percent')).toHaveTextContent('8%');
    expect(screen.getByRole('option', { name: 'Yusuf Karim · EMP-1102 · G6' })).toBeInTheDocument();
    expect(searchEmployees).toHaveBeenCalledWith(SUB_A, REQUEST);
  });

  it('assesses the first employee by default, with a card per criterion [R1-03, R1-04]', async () => {
    render(await requestPage());
    expect(
      screen.getByRole('heading', { level: 2, name: '2. Eligibility criteria for Omar Haddad' }),
    ).toBeInTheDocument();
    const section = screen.getByRole('region', { name: '2. Eligibility criteria' });
    expect(section.querySelectorAll('article')).toHaveLength(5);
    expect(screen.getByRole('group', { name: 'Result for C1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download appraisal-2026.pdf' })).toHaveAttribute(
      'href',
      `/requests/${DRAFT.id}/evidence/${EVIDENCE_ID}`,
    );
    expect(
      screen.getByText('To complete: add a justification, attach evidence.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assess criteria for Omar Haddad' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('assesses the employee named in the URL, falling back to the first', async () => {
    render(await requestPage(REQUEST, { employee: LINE_2 }));
    expect(
      screen.getByRole('heading', { level: 2, name: '2. Eligibility criteria for Neha Iyer' }),
    ).toBeInTheDocument();
    render(await requestPage(REQUEST, { employee: 'someone-else' }));
    expect(
      screen.getByRole('heading', { level: 2, name: '2. Eligibility criteria for Omar Haddad' }),
    ).toBeInTheDocument();
  });

  it('lists who is ready to submit, with Submit disabled until S4', async () => {
    render(await requestPage());
    expect(screen.getByTestId('ready-note')).toHaveTextContent(
      '2 of 2 employees still have incomplete criteria. Submit unlocks when every employee is 5/5.',
    );
    expect(screen.getByText('3 criteria incomplete')).toBeInTheDocument();
    expect(screen.getByText('5 criteria incomplete · no proposed increment')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit to Sirius HR' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(/^On submit the request is routed to Sirius HR/u);
  });

  it('offers Submit to Sirius HR with a fresh key per page view [R1-07]', async () => {
    const first = render(await requestPage());
    const keyOf = (root: HTMLElement) =>
      root.querySelector('input[name="submitKey"]')?.getAttribute('value');
    const key = keyOf(first.container);
    expect(key).toMatch(/^[0-9a-f-]{36}$/u);
    first.unmount();
    const second = render(await requestPage());
    expect(keyOf(second.container)).not.toBe(key);
    expect(screen.queryByText('Waiting for Sirius HR')).toBeNull();
  });

  it('sends a submitted request to its detail page', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: submittedRequest() });
    await expect(requestPage()).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}`);
    expect(searchEmployees).not.toHaveBeenCalled();
  });

  it('confirms a save and shows a known error', async () => {
    render(await requestPage(REQUEST, { saved: '1', error: 'request.errors.duplicate' }));
    expect(screen.getByText('Draft saved.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('That employee is already in the request.');
  });

  it('says when every employee is already added', async () => {
    vi.mocked(searchEmployees).mockResolvedValue({ kind: 'ok', data: [] });
    render(await requestPage());
    expect(
      screen.getByText('Every active Subsidiary A employee is already in this request.'),
    ).toBeInTheDocument();
  });

  it('is not found for people who don’t prepare requests', async () => {
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_REVIEWER);
    await expect(requestPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getRequest).not.toHaveBeenCalled();
  });

  it('hides Save draft while the draft is empty', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: { ...DRAFT, lines: [] } });
    render(await requestPage());
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
  });

  it.each([
    ['for a malformed ID', () => undefined, 'not-a-uuid'],
    [
      'for a request the API can’t find (another subsidiary’s)',
      () =>
        vi
          .mocked(getRequest)
          .mockResolvedValue({ kind: 'error', status: 404, code: 'NOT_FOUND', details: [] }),
      REQUEST,
    ],
  ])('answers not found %s', async (_label, arrange, id) => {
    arrange();
    await expect(requestPage(id)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('ends the session, shows the error page, or renders nothing, as the API answers', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(requestPage()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'error',
      status: 403,
      code: 'FORBIDDEN',
      details: [],
    });
    await expect(requestPage()).rejects.toThrow('Increment request API unavailable');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(requestPage()).resolves.toBeNull();
  });
});

describe('Request detail [R1-06, R1-07]', () => {
  beforeEach(() => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: submittedRequest() });
    vi.mocked(getHistory).mockResolvedValue({ kind: 'ok', data: [] });
  });

  it('shows the request’s history, newest first, in words [R1-15]', async () => {
    vi.mocked(getHistory).mockResolvedValue({
      kind: 'ok',
      data: [
        auditEvent({
          id: '2',
          at: '2026-10-16T06:00:00.000Z',
          actorName: 'Sara Al Mansoori',
          action: 'request_line.returned',
          subjectType: 'request_line',
          subjectId: LINE_2,
          details: { reasonCode: 'missing_evidence' },
        }),
        auditEvent(),
      ],
    });
    render(await detailPage());
    const table = screen.getByRole('table', { name: 'History of INC-2026-0152' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(
      '16 Oct 2026, 10:00Sara Al MansooriNeha Iyer returned to the subsidiary',
    );
    expect(rows[2]).toHaveTextContent('Priya NairSubmitted to Sirius HR');
  });

  it('says when nothing is recorded, and still shows the request if the trail can’t be read', async () => {
    render(await detailPage());
    expect(screen.getByText('Nothing recorded yet.')).toBeInTheDocument();
    cleanup();
    vi.mocked(getHistory).mockResolvedValue({ kind: 'unavailable' });
    render(await detailPage());
    expect(screen.getByRole('heading', { level: 1, name: 'INC-2026-0152' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'History' })).toBeNull();
  });

  it('shows where the request is, its figures and its employees (Figma "Request detail")', async () => {
    render(await detailPage());
    expect(screen.getByRole('heading', { level: 1, name: 'INC-2026-0152' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Submitted 15 Oct 2026, 11:14 by Priya Nair · Subsidiary A · With Sirius HR',
      ),
    ).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumb).toHaveTextContent('Request detail');
    expect(screen.getByRole('link', { name: 'New increment request' })).toHaveAttribute(
      'href',
      '/requests/new',
    );
    const steps = screen.getByRole('list', { name: 'Where this request is' });
    expect(steps).toHaveTextContent('Done · 15 Oct 2026');
    expect(within(steps).getAllByRole('listitem')).toHaveLength(7);
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('Sirius HR reviewing');
    expect(screen.getByText('Total increment / month')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Employees in INC-2026-0152' });
    expect(within(table).getByRole('columnheader', { name: 'Criteria C1–C5' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(table).toHaveTextContent('EMP-3318');
    expect(
      within(table).getByRole('link', { name: 'View the status of Omar Haddad' }),
    ).toHaveAttribute('href', `/requests/${REQUEST}/employees/${LINE_1}`);
    // No success banner unless just submitted.
    expect(screen.queryByText('INC-2026-0152 submitted to Sirius HR')).toBeNull();
    expect(searchEmployees).not.toHaveBeenCalled();
  });

  it('confirms a submit, with View Employees and a dismiss that drops the banner', async () => {
    render(await detailPage(REQUEST, { submitted: '1' }));
    expect(screen.getByText('INC-2026-0152 submitted to Sirius HR')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Employees' })).toHaveAttribute(
      'href',
      '#employees',
    );
    expect(screen.getByRole('link', { name: 'Dismiss' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST}`,
    );
    expect(document.getElementById('employees')).not.toBeNull();
  });

  it('shows Sirius HR the request without New increment request', async () => {
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_REVIEWER);
    render(await detailPage());
    expect(screen.getByRole('heading', { level: 1, name: 'INC-2026-0152' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New increment request' })).toBeNull();
  });

  it('offers a decider "Decide all remaining" while two or more employees wait [R1-09]', async () => {
    const decider = {
      ...SIRIUS_REVIEWER,
      permissions: [
        'increment_request:read',
        'increment_request:review',
        'increment_request:decide',
      ] as Me['permissions'],
    };
    vi.mocked(requireViewer).mockResolvedValue(decider);
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: submittedRequest({ status: 'under_review' }),
    });
    render(await detailPage());
    const card = screen.getByRole('region', { name: 'Decide all remaining' });
    expect(
      within(card).getByText(/^2 employees are still waiting for a decision\./u),
    ).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Approve all 2' })).toBeDisabled();
    cleanup();
    // One employee waiting: decided on their own page; a reviewer who can't decide: no card.
    const one = submittedRequest({ status: 'under_review' });
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: {
        ...one,
        lines: one.lines.map((line, index) =>
          index === 0 ? line : { ...line, reviewStatus: 'approved' as const },
        ),
      },
    });
    render(await detailPage());
    expect(screen.queryByRole('region', { name: 'Decide all remaining' })).toBeNull();
    cleanup();
    vi.mocked(requireViewer).mockResolvedValue({
      ...decider,
      permissions: ['increment_request:read', 'increment_request:review'],
    });
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: submittedRequest() });
    render(await detailPage());
    expect(screen.queryByRole('region', { name: 'Decide all remaining' })).toBeNull();
  });

  it('confirms a decision for all remaining, and ignores an unknown one', async () => {
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_REVIEWER);
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: submittedRequest() });
    render(await detailPage(REQUEST, { decided: 'returned' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Every remaining employee returned to SUB-A.',
    );
    cleanup();
    render(await detailPage(REQUEST, { decided: 'escalated' }));
    expect(screen.queryByText(/Every remaining employee/u)).toBeNull();
  });

  it('opens a draft in the editor for its preparer, and is not found for anyone else', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: DRAFT });
    await expect(detailPage()).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}/edit`);
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_REVIEWER);
    await expect(detailPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each([
    [
      'without the read permission',
      () => vi.mocked(requireViewer).mockResolvedValue({ ...ALPHA_HR, permissions: [] }),
      REQUEST,
    ],
    ['for a malformed ID', () => undefined, 'not-a-uuid'],
    [
      'for a request the API can’t find (another subsidiary’s)',
      () =>
        vi
          .mocked(getRequest)
          .mockResolvedValue({ kind: 'error', status: 404, code: 'NOT_FOUND', details: [] }),
      REQUEST,
    ],
  ])('answers not found %s', async (_label, arrange, id) => {
    arrange();
    await expect(detailPage(id)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('ends the session, shows the error page, or renders nothing, as the API answers', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(detailPage()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(getRequest).mockResolvedValue({ kind: 'unavailable' });
    await expect(detailPage()).rejects.toThrow('Increment request API unavailable');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(detailPage()).resolves.toBeNull();
  });
});

const ALPHA_SUBMITTER: Me = {
  ...ALPHA_HR,
  permissions: ['increment_request:read', 'increment_request:create', 'increment_request:submit'],
};

/** INC-2026-0152 with Omar returned by Sirius HR (missing evidence) and Neha still in review. */
function returnedRequest() {
  const request = submittedRequest({ status: 'returned', version: 6 });
  return {
    ...request,
    lines: request.lines.map((line, index) =>
      index === 0
        ? {
            ...line,
            reviewStatus: 'returned' as const,
            decision: decisionOf({
              decision: 'returned',
              reasonCode: 'missing_evidence',
              comment: 'Attach the 2026 appraisal for C1.',
            }),
          }
        : line,
    ),
  };
}

describe('Returned requests [R1-08]', () => {
  it('shows the subsidiary what came back, with the question and Update and resubmit', async () => {
    vi.mocked(requireViewer).mockResolvedValue(ALPHA_SUBMITTER);
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: returnedRequest() });
    render(await detailPage());
    expect(
      screen.getByText(
        'Submitted 15 Oct 2026, 11:14 by Priya Nair · Subsidiary A · With Subsidiary A',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Sirius HR returned 1 employee to you')).toBeInTheDocument();
    expect(screen.getByText('“Attach the 2026 appraisal for C1.”')).toBeInTheDocument();
    expect(screen.getByText(/· Missing evidence/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Omar Haddad' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST}/employees/${LINE_1}`,
    );
    expect(screen.getByRole('link', { name: 'Update and resubmit' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST}/edit`,
    );
    const table = screen.getByRole('table', { name: 'Employees in INC-2026-0152' });
    expect(table).toHaveTextContent('Returned');
    expect(table).toHaveTextContent('With Sirius HR');
  });

  it('confirms a resubmission, and tells Sirius HR who is back with the subsidiary', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: submittedRequest() });
    render(await detailPage(REQUEST, { resubmitted: '1' }));
    expect(screen.getByText('Resubmitted to Sirius HR.')).toBeInTheDocument();
    vi.mocked(requireViewer).mockResolvedValue({
      ...SIRIUS_REVIEWER,
      permissions: ['increment_request:read', 'increment_request:review'],
    });
    const both = returnedRequest();
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: {
        ...both,
        lines: both.lines.map((line) => ({ ...line, reviewStatus: 'returned' as const })),
      },
    });
    render(await detailPage());
    expect(screen.getByText('2 employees are back with Subsidiary A')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Update and resubmit' })).toBeNull();
    const breadcrumb = screen.getAllByRole('navigation', { name: 'Breadcrumb' }).at(-1);
    expect(
      within(must(breadcrumb)).getByRole('link', { name: 'Request Tracker' }),
    ).toBeInTheDocument();
    // Reviewers review each employee from here.
    expect(screen.getAllByText('Review').length).toBeGreaterThan(0);
  });

  it('shows the final status once every employee is decided', async () => {
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: submittedRequest({
        status: 'rejected',
        stage: { kind: 'decided', of: 5 },
        decidedAt: '2026-10-16T09:00:00.000Z',
      }),
    });
    render(await detailPage());
    expect(screen.getByText('Final status: Rejected')).toBeInTheDocument();
    cleanup();
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: submittedRequest({
        status: 'approved',
        stage: { kind: 'decided', of: 5 },
        decidedAt: '2026-10-16T09:00:00.000Z',
      }),
    });
    render(await detailPage());
    expect(screen.getByText('Final status: Approved')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Sirius HR decided every employee on 16 Oct 2026. Open an employee to see the decision.',
      ),
    ).toBeInTheDocument();
  });

  it('lets the subsidiary fix only the returned employees and resubmit them', async () => {
    vi.mocked(requireViewer).mockResolvedValue(ALPHA_SUBMITTER);
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: returnedRequest() });
    render(await requestPage(REQUEST, { employee: LINE_2 }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Update returned employees' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      'INC-2026-0152 · returned',
    );
    // Neha is with Sirius HR: not editable, and not the one assessed even when asked for.
    expect(screen.getAllByRole('textbox', { name: /^Proposed increase/u })).toHaveLength(1);
    expect(screen.getByText('With Sirius HR')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '2. Eligibility criteria for Omar Haddad' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sirius HR asks')).toBeInTheDocument();
    expect(screen.getByText('Attach the 2026 appraisal for C1.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Add employee' })).toBeNull();
    expect(searchEmployees).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Resubmit to Sirius HR' })).toBeInTheDocument();
  });

  it('shows a returned employee’s question without reason or comment when there is none', async () => {
    vi.mocked(requireViewer).mockResolvedValue(ALPHA_SUBMITTER);
    const request = returnedRequest();
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: {
        ...request,
        lines: request.lines.map((line) =>
          line.decision === null
            ? line
            : { ...line, decision: decisionOf({ decision: 'returned' }) },
        ),
      },
    });
    render(await requestPage());
    expect(screen.getByText('Sirius HR asks')).toBeInTheDocument();
    expect(screen.queryByText(/^Reason:/u)).toBeNull();
  });
});
