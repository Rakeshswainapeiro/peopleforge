import type { Me } from '@peopleforge/contracts';
import { render, screen, within } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { listRequests } from '@/server/increment-requests';
import { notificationSummary } from '@/server/notifications';
import { requireViewer } from '@/server/session';
import PortalLayout from './layout';
import HomePage from './page';
import ReportsPage from './reports/page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/app/actions/set-locale', () => ({ setLocale: vi.fn() }));
vi.mock('@/app/sign-in/actions', () => ({ signOut: vi.fn(), startSignIn: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({ listRequests: vi.fn() }));
vi.mock('@/server/notifications', () => ({ notificationSummary: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
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

async function renderPortal(page: () => Promise<React.ReactNode>) {
  render(await PortalLayout({ children: await page() }));
}

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
  vi.mocked(usePathname).mockReturnValue('/');
  vi.mocked(listRequests).mockResolvedValue({
    kind: 'ok',
    data: { items: [], page: 1, pageSize: 10, total: 0 },
  });
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
    await renderPortal(ReportsPage);
    expect(screen.getByText('Subsidiary HR · Subsidiary A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New Request' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
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

describe('HomePage', () => {
  it('renders the Phase 1 areas', async () => {
    render(await HomePage());
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Increment requests' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders Arabic where translated and English fallback elsewhere', async () => {
    vi.mocked(getRequestLocale).mockResolvedValue('ar');
    render(await HomePage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('مرحباً');
    expect(screen.getByRole('heading', { name: 'Increment requests' })).toBeInTheDocument();
  });

  it('lists the caller’s drafts under "Needs your action" (Figma)', async () => {
    vi.mocked(requireViewer).mockResolvedValue(ALPHA_HR);
    const draft = {
      id: '11111111-1111-4111-8111-111111111111',
      reference: 'INC-2026-0150',
      status: 'draft' as const,
      entityId: SUB_A,
      cycleId: '00000000-0000-4000-8000-00000000c026',
      createdAt: '2026-10-14T07:00:00.000Z',
      updatedAt: '2026-10-14T07:00:00.000Z',
    };
    vi.mocked(listRequests).mockResolvedValue({
      kind: 'ok',
      data: {
        items: [
          { ...draft, employeeCount: 4 },
          {
            ...draft,
            id: '11111111-1111-4111-8111-111111111112',
            reference: 'INC-2026-0151',
            employeeCount: 1,
          },
        ],
        page: 1,
        pageSize: 10,
        total: 2,
      },
    });
    render(await HomePage());
    const panel = screen.getByRole('region', { name: 'Needs your action' });
    expect(panel).toHaveTextContent('INC-2026-0150 · Draft not submitted');
    expect(panel).toHaveTextContent('4 employees added');
    expect(panel).toHaveTextContent('1 employee added');
    expect(screen.getAllByRole('link', { name: 'Continue draft' })[0]).toHaveAttribute(
      'href',
      `/requests/${draft.id}`,
    );
    expect(listRequests).toHaveBeenCalledWith({ status: 'draft', pageSize: 10 });
  });

  it('shows no drafts panel without drafts or for Sirius roles', async () => {
    vi.mocked(requireViewer).mockResolvedValue(ALPHA_HR);
    render(await HomePage());
    expect(screen.queryByRole('region', { name: 'Needs your action' })).not.toBeInTheDocument();
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    vi.mocked(listRequests).mockClear();
    render(await HomePage());
    expect(listRequests).not.toHaveBeenCalled();
  });

  it('confirms a draft discarded by removing its last employee', async () => {
    render(await HomePage({ searchParams: Promise.resolve({ discarded: '1' }) }));
    expect(screen.getByText('Draft discarded: it had no employees left.')).toBeInTheDocument();
  });

  it('explains when the role grants no permissions yet', async () => {
    vi.mocked(requireViewer).mockResolvedValue({ ...REVIEWER, permissions: [] });
    render(await HomePage());
    expect(screen.getByRole('status')).toHaveTextContent(/doesn't include any permissions/);
  });
});

describe('placeholder pages', () => {
  it.each([
    ['Reports', ReportsPage, REVIEWER],
    ['Reports', ReportsPage, ALPHA_HR],
  ])('renders %s for a permitted viewer', async (heading, Page, viewer) => {
    vi.mocked(requireViewer).mockResolvedValue(viewer);
    render(await Page());
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Coming in a later release.');
  });

  it.each([['Reports without a report permission', ReportsPage, { ...ALPHA_HR, permissions: [] }]])(
    'answers not found for %s',
    async (_label, Page, viewer) => {
      vi.mocked(requireViewer).mockResolvedValue(viewer);
      await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );

  it.each([HomePage, ReportsPage])('renders nothing while the API is unavailable', async (Page) => {
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(Page()).resolves.toBeNull();
  });
});
