import type { Me } from '@peopleforge/access';
import { render, screen, within } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { requireViewer } from '@/server/session';
import PortalLayout from './layout';
import NotificationsPage from './notifications/page';
import HomePage from './page';
import ReportsPage from './reports/page';
import NewRequestPage from './requests/new/page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/app/actions/set-locale', () => ({ setLocale: vi.fn() }));
vi.mock('@/app/sign-in/actions', () => ({ signOut: vi.fn(), startSignIn: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
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
    await renderPortal(NewRequestPage);
    expect(screen.getByText('Subsidiary HR · Subsidiary A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New Request' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { level: 1, name: 'New increment request' })).toBeVisible();
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

  it('explains when the role grants no permissions yet', async () => {
    vi.mocked(requireViewer).mockResolvedValue({ ...REVIEWER, permissions: [] });
    render(await HomePage());
    expect(screen.getByRole('status')).toHaveTextContent(/doesn't include any permissions/);
  });
});

describe('placeholder pages', () => {
  it.each([
    ['Notifications', NotificationsPage, REVIEWER],
    ['Reports', ReportsPage, REVIEWER],
    ['Reports', ReportsPage, ALPHA_HR],
    ['New increment request', NewRequestPage, ALPHA_HR],
  ])('renders %s for a permitted viewer', async (heading, Page, viewer) => {
    vi.mocked(requireViewer).mockResolvedValue(viewer);
    render(await Page());
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Coming in a later release.');
  });

  it.each([
    ['New Request for a reviewer', NewRequestPage, REVIEWER],
    ['Reports without a report permission', ReportsPage, { ...ALPHA_HR, permissions: [] }],
  ])('answers not found for %s', async (_label, Page, viewer) => {
    vi.mocked(requireViewer).mockResolvedValue(viewer);
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each([HomePage, NotificationsPage])(
    'renders nothing while the API is unavailable',
    async (Page) => {
      vi.mocked(requireViewer).mockResolvedValue(null);
      await expect(Page()).resolves.toBeNull();
    },
  );
});
