import { ListIncrementRequestsQuerySchema, type Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import {
  dashboardSummary,
  listRequestLines,
  listRequests,
  openCycles,
} from '@/server/increment-requests';
import {
  CYCLE_ID,
  dashboardSummaryFixture,
  LINE_1,
  linePage,
  OPEN_CYCLE,
  REQUEST_ID,
  requestPage,
  requestSummary,
} from '@/test-support/requests';
import { notificationSummary } from '@/server/notifications';
import { requireViewer } from '@/server/session';
import PortalLayout from './layout';
import PortalLoading from './loading';
import HomePage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/app/actions/set-locale', () => ({ setLocale: vi.fn() }));
vi.mock('@/app/sign-in/actions', () => ({ signOut: vi.fn(), startSignIn: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({
  listRequests: vi.fn(),
  listRequestLines: vi.fn(),
  dashboardSummary: vi.fn(),
  openCycles: vi.fn(),
}));
vi.mock('@/server/notifications', () => ({ notificationSummary: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ replace: vi.fn(), push: vi.fn() })),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const SUB_A = '00000000-0000-4000-8000-0000000e000a';

const REVIEWER: Me = {
  userId: 'oid-1',
  username: 'pf.reviewer',
  name: 'Reviewer Test',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:decide', 'report:read_executive'],
  entities: [],
};

const ALPHA_HR: Me = {
  userId: 'oid-4',
  username: 'pf.alpha.hr',
  name: 'Alpha HR',
  roles: ['PeopleForge.SubsidiaryHR'],
  scope: 'entity',
  entityIds: [SUB_A],
  permissions: ['increment_request:create', 'report:read_operational'],
  entities: [{ id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } }],
};

/** Sirius HR reviewer as the API describes them: reads every subsidiary's submitted requests. */
const SIRIUS_READER: Me = {
  ...REVIEWER,
  permissions: [...REVIEWER.permissions, 'increment_request:read'],
};

/** Subsidiary HR preparing requests for Subsidiary A. */
const PREPARER: Me = {
  ...ALPHA_HR,
  permissions: [...ALPHA_HR.permissions, 'increment_request:read'],
};

async function renderPortal(page: () => Promise<React.ReactNode>) {
  render(await PortalLayout({ children: await page() }));
}

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
  vi.mocked(usePathname).mockReturnValue('/');
  vi.mocked(listRequests).mockResolvedValue({ kind: 'ok', data: requestPage([]) });
  vi.mocked(listRequestLines).mockResolvedValue({ kind: 'ok', data: linePage([]) });
  vi.mocked(dashboardSummary).mockResolvedValue({ kind: 'ok', data: dashboardSummaryFixture() });
  vi.mocked(openCycles).mockResolvedValue({ kind: 'ok', data: [OPEN_CYCLE] });
  vi.mocked(notificationSummary).mockResolvedValue({ kind: 'ok', data: { unread: 0 } });
});

describe('portal shell', () => {
  it('shows a Sirius reviewer every subsidiary and no New Request', async () => {
    await renderPortal(HomePage);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Home', 'Notifications', 'Reports']);
    expect(screen.getByText('Signed in as Reviewer Test')).toBeInTheDocument();
    expect(screen.getByText('Sirius HR Reviewer · All subsidiaries')).toBeInTheDocument();
    expect(screen.getByText('RT')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });

  it('shows subsidiary HR its subsidiary and New Request, marking the current page', async () => {
    vi.mocked(requireViewer).mockResolvedValue(ALPHA_HR);
    vi.mocked(usePathname).mockReturnValue('/requests/new');
    await renderPortal(() => Promise.resolve(null));
    expect(screen.getByText('Subsidiary HR · Subsidiary A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New Request' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Subsidiary HR's home is "My Request" (Figma).
    expect(screen.getByRole('link', { name: 'My Request' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull();
  });

  it('shows unread notifications on the bell, and nothing when the count is unknown', async () => {
    vi.mocked(notificationSummary).mockResolvedValue({ kind: 'ok', data: { unread: 3 } });
    await renderPortal(HomePage);
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
    vi.mocked(notificationSummary).mockResolvedValue({ kind: 'unavailable' });
    await renderPortal(HomePage);
    expect(screen.getAllByRole('link', { name: 'Notifications' })).toHaveLength(1);
  });

  it('says when a subsidiary user has no subsidiary assigned yet', async () => {
    vi.mocked(requireViewer).mockResolvedValue({ ...ALPHA_HR, entityIds: [], entities: [] });
    await renderPortal(HomePage);
    expect(screen.getByText('Subsidiary HR · No subsidiary assigned')).toBeInTheDocument();
  });

  it('shows a retryable notice, and no sidebar, while the API is unavailable', async () => {
    vi.mocked(requireViewer).mockResolvedValue(null);
    await renderPortal(HomePage);
    expect(screen.getByRole('alert')).toHaveTextContent('PeopleForge is temporarily unavailable');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('HomePage for roles without increment requests', () => {
  it('renders the Phase 1 areas', async () => {
    render(await HomePage());
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Increment requests' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(dashboardSummary).not.toHaveBeenCalled();
  });

  it('renders Arabic where translated and English fallback elsewhere', async () => {
    vi.mocked(getRequestLocale).mockResolvedValue('ar');
    render(await HomePage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('مرحباً');
    expect(screen.getByRole('heading', { name: 'Increment requests' })).toBeInTheDocument();
  });

  it('explains when the role grants no permissions yet', async () => {
    vi.mocked(requireViewer).mockResolvedValue({ ...REVIEWER, permissions: [] });
    render(await HomePage());
    expect(screen.getByRole('status')).toHaveTextContent(/doesn't include any permissions/);
  });

  it('confirms a draft discarded by removing its last employee', async () => {
    render(await HomePage({ searchParams: Promise.resolve({ discarded: '1' }) }));
    expect(screen.getByText('Draft discarded: it had no employees left.')).toBeInTheDocument();
  });
});

const RETURNED_ID = '11111111-1111-4111-8111-111111111149';
const RETURNED = requestSummary({
  id: RETURNED_ID,
  reference: 'INC-2026-0149',
  status: 'returned',
  statusChangedAt: '2026-10-09T07:00:00.000Z',
  stage: { kind: 'criterion', criterion: 3, of: 5 },
});

const page = (params: Record<string, string> = {}) =>
  HomePage({ searchParams: Promise.resolve(params) });

describe('HomePage: My increment requests [R1-10, DASH-D1]', () => {
  beforeEach(() => {
    vi.mocked(requireViewer).mockResolvedValue(PREPARER);
    vi.mocked(listRequests).mockImplementation((query = {}) =>
      Promise.resolve({
        kind: 'ok',
        data:
          query.status === 'draft'
            ? requestPage()
            : query.status === 'returned'
              ? requestPage([RETURNED])
              : requestPage([
                  requestSummary({
                    reference: 'INC-2026-0152',
                    status: 'submitted',
                    stage: { kind: 'criterion', criterion: 1, of: 5 },
                  }),
                ]),
      }),
    );
  });

  it('shows subsidiary HR their cards, drafts to continue, and requests in the open cycle', async () => {
    render(await page());
    expect(
      screen.getByRole('heading', { level: 1, name: 'My increment requests' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Requests raised by Subsidiary A. Other entities are not visible to you.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New increment request' })[0]).toHaveAttribute(
      'href',
      '/requests/new',
    );
    const cards = screen.getByRole('list', { name: 'Request counts' });
    expect(within(cards).getAllByRole('listitem')).toHaveLength(5);
    expect(cards).toHaveTextContent('Drafts1Not yet submitted');

    const action = screen.getByRole('region', { name: 'Needs your action' });
    expect(action).toHaveTextContent('2 items need your action');
    expect(action).toHaveTextContent(
      '2 items: drafts to submit and returns to answer. Longest waiting first.',
    );
    const actions = within(action).getByRole('table', { name: 'Requests that need your action' });
    expect(actions).toHaveTextContent('4 employeesINC-2026-0150');
    expect(actions).toHaveTextContent('Criteria 15 of 20 complete');
    expect(within(action).getByRole('link', { name: 'Continue draft' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST_ID}/edit`,
    );
    // A return to answer, after the older draft (R1-08).
    expect(actions).toHaveTextContent('Returned4 employeesINC-2026-0149');
    expect(within(action).getByRole('link', { name: 'Respond' })).toHaveAttribute(
      'href',
      `/requests/${RETURNED_ID}/edit`,
    );
    expect(action).toHaveTextContent('Showing 2 of 2');
    expect(within(action).getByRole('link', { name: 'See all drafts' })).toHaveAttribute(
      'href',
      '/?status=draft',
    );
    expect(within(action).getByRole('combobox', { name: 'Show' })).toHaveValue('all');
    // Figma: "Needs your action" comes before the counts.
    expect(action.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const tabs = screen.getByRole('navigation', { name: 'View' });
    expect(within(tabs).getByRole('link', { name: /By request/u })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(tabs).toHaveTextContent('By request 3');
    expect(tabs).toHaveTextContent('By employee 7');

    const table = screen.getByRole('table', { name: 'Increment requests' });
    expect(within(table).getByRole('link', { name: 'INC-2026-0152' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST_ID}`,
    );
    expect(table).toHaveTextContent('Criterion 1 of 5');
    expect(table).toHaveTextContent('Submitted');
    expect(table).toHaveTextContent('Sirius HR');
    expect(within(table).queryByRole('columnheader', { name: 'Subsidiary' })).toBeNull();
    expect(
      within(table).getByRole('link', { name: 'View the employees of INC-2026-0152' }),
    ).toHaveAttribute('href', `/?view=employees&request=${REQUEST_ID}`);

    // The first open cycle by default; drafts for the panel from every cycle.
    expect(dashboardSummary).toHaveBeenCalledWith({ cycleId: CYCLE_ID });
    expect(listRequests).toHaveBeenCalledWith({ cycleId: CYCLE_ID, page: 1, pageSize: 10 });
    // Drafts for the panel from every cycle, longest waiting first.
    expect(listRequests).toHaveBeenCalledWith({ status: 'draft', order: 'oldest', pageSize: 10 });
    expect(listRequests).toHaveBeenCalledWith({
      status: 'returned',
      order: 'oldest',
      pageSize: 10,
    });
    // Every query is one the API accepts (it allows only its page sizes).
    for (const [query] of vi.mocked(listRequests).mock.calls) {
      expect(ListIncrementRequestsQuerySchema.safeParse(query).success).toBe(true);
    }
    expect(screen.getByRole('combobox', { name: 'Period' })).toHaveValue(CYCLE_ID);
    expect(screen.queryByRole('navigation', { name: 'Request pages' })).toBeInTheDocument();
  });

  it('shows employees By employee, optionally for one request', async () => {
    vi.mocked(listRequestLines).mockResolvedValue({ kind: 'ok', data: linePage() });
    render(
      await page({
        view: 'employees',
        request: REQUEST_ID,
        cycle: 'all',
        status: 'submitted',
        q: 'omar',
      }),
    );
    expect(listRequestLines).toHaveBeenCalledWith({
      status: 'submitted',
      search: 'omar',
      requestId: REQUEST_ID,
      page: 1,
      pageSize: 10,
    });
    const table = screen.getByRole('table', { name: 'Employees in increment requests' });
    expect(table).toHaveTextContent('Omar Haddad');
    expect(table).toHaveTextContent('EMP-3318 · G7 · INC-2026-0152');
    expect(table).toHaveTextContent('8%');
    expect(screen.getByText('C1 pass, C2 pass, C3 pass, C4 pass, C5 fail')).toHaveClass('sr-only');
    expect(
      within(table).getByRole('link', { name: 'View the status of Omar Haddad' }),
    ).toHaveAttribute('href', `/requests/${REQUEST_ID}/employees/${LINE_1}`);
    expect(screen.getByText('Employees of INC-2026-0152')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show all employees' })).toHaveAttribute(
      'href',
      '/?view=employees&cycle=all&status=submitted&q=omar',
    );
    expect(screen.getByRole('combobox', { name: 'Period' })).toHaveValue('all');
  });

  it('shows Sirius HR every subsidiary without drafts, a Subsidiary column and no New request', async () => {
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_READER);
    render(await page());
    expect(screen.getByRole('heading', { level: 1, name: 'Request Tracker' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Every subsidiary's increment requests, where each one is and who it is with.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Subsidiary' })).toHaveValue('');
    expect(screen.getByRole('columnheader', { name: 'Submitted' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New increment request' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Needs your action' })).toBeNull();
    expect(
      within(screen.getByRole('list', { name: 'Request counts' })).getAllByRole('listitem'),
    ).toHaveLength(4);
    expect(screen.getByRole('columnheader', { name: 'Subsidiary' })).toBeInTheDocument();
    expect(listRequests).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
  });

  it('shows a Subsidiary column By employee for Sirius HR too', async () => {
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_READER);
    vi.mocked(listRequestLines).mockResolvedValue({ kind: 'ok', data: linePage() });
    render(await page({ view: 'employees' }));
    expect(screen.getByRole('columnheader', { name: 'Subsidiary' })).toBeInTheDocument();
  });

  it('invites a first request when there are none, and Sirius HR to wait', async () => {
    vi.mocked(listRequests).mockResolvedValue({ kind: 'ok', data: requestPage([]) });
    render(await page());
    expect(screen.getByText('No increment requests yet')).toBeInTheDocument();
    expect(
      screen.getByText('Start one to propose increments for your employees.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Request pages' })).toBeNull();
    // Without an assigned subsidiary, the intro doesn't name one.
    vi.mocked(requireViewer).mockResolvedValue({ ...SIRIUS_READER, scope: 'entity', entities: [] });
    render(await page());
    expect(
      screen.getAllByText('Requests appear here once a subsidiary submits them.'),
    ).toHaveLength(1);
  });

  it('offers to clear filters that match nothing', async () => {
    vi.mocked(listRequestLines).mockResolvedValue({ kind: 'ok', data: linePage([]) });
    render(await page({ view: 'employees', request: REQUEST_ID }));
    expect(screen.getByText('Employees of one request')).toBeInTheDocument();
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/?view=employees',
    );
    vi.mocked(listRequests).mockResolvedValue({ kind: 'ok', data: requestPage([]) });
    render(await page({ status: 'draft' }));
    expect(screen.getAllByText('Nothing matches these filters')).toHaveLength(2);
  });

  it('pages with a rows-per-page choice, and goes to the last page from a stale link', async () => {
    vi.mocked(listRequests).mockResolvedValue({
      kind: 'ok',
      data: requestPage([requestSummary()], { total: 30, page: 2, pageSize: 10 }),
    });
    render(await page({ page: '2' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('10');
    await expect(page({ page: '9' })).rejects.toThrow('NEXT_REDIRECT /?page=3');
    // Filtering keeps the chosen page size.
    const { container } = render(await page({ size: '25' }));
    expect(container.querySelector('input[type="hidden"][name="size"]')).toHaveValue('25');
  });

  it('works without an open cycle: every period, nothing to pick', async () => {
    vi.mocked(openCycles).mockResolvedValue({ kind: 'unavailable' });
    render(await page());
    expect(dashboardSummary).toHaveBeenCalledWith({});
    expect(screen.getByRole('combobox', { name: 'Period' })).toHaveValue('all');
  });

  it('ends a session the API no longer accepts, and fails loudly when the API is down', async () => {
    vi.mocked(dashboardSummary).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(page()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(dashboardSummary).mockResolvedValue({ kind: 'unavailable' });
    await expect(page()).rejects.toThrow('Increment request API unavailable');
  });

  it('keeps the discarded-draft confirmation under the header', async () => {
    render(await page({ discarded: '1' }));
    expect(screen.getByText('Draft discarded: it had no employees left.')).toBeInTheDocument();
  });
});

describe('HomePage without the API', () => {
  it('renders nothing while the API is unavailable', async () => {
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(HomePage()).resolves.toBeNull();
  });
});

describe('PortalLoading', () => {
  it('shows the page shape inside the shell and announces loading politely', async () => {
    const { container } = render(await PortalLoading());
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    // Only the content area: no second sidebar or navigation.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(3);
  });
});

describe('HomePage: Needs your action choices [R1-08]', () => {
  beforeEach(() => {
    vi.mocked(requireViewer).mockResolvedValue(PREPARER);
    vi.mocked(listRequests).mockImplementation((query = {}) =>
      Promise.resolve({
        kind: 'ok',
        data: query.status === 'returned' ? requestPage([RETURNED]) : requestPage(),
      }),
    );
  });

  it('shows only returns when asked, with See all pointing at them', async () => {
    render(await page({ show: 'returned' }));
    const action = screen.getByRole('region', { name: 'Needs your action' });
    expect(within(action).getByRole('combobox', { name: 'Show' })).toHaveValue('returned');
    expect(action).toHaveTextContent('Showing 1 of 1');
    expect(within(action).getByRole('link', { name: 'See all drafts' })).toHaveAttribute(
      'href',
      '/?status=returned&show=returned',
    );
    expect(listRequests).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
  });

  it('shows only drafts when asked, and nothing when nothing waits', async () => {
    render(await page({ show: 'drafts' }));
    expect(listRequests).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'returned' }));
    cleanup();
    vi.mocked(dashboardSummary).mockResolvedValue({
      kind: 'ok',
      data: dashboardSummaryFixture({
        byStatus: {
          draft: 0,
          submitted: 1,
          under_review: 0,
          returned: 0,
          approved: 0,
          partly_approved: 0,
          rejected: 0,
        },
      }),
    });
    render(await page());
    expect(screen.queryByRole('region', { name: 'Needs your action' })).toBeNull();
  });

  it('lets Sirius HR filter by subsidiary', async () => {
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_READER);
    render(await page({ entity: SUB_A }));
    expect(dashboardSummary).toHaveBeenCalledWith(expect.objectContaining({ entityId: SUB_A }));
  });
});
