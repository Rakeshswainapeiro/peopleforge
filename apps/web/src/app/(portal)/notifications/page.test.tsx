import type { Me, NotificationPage } from '@peopleforge/contracts';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { listNotifications } from '@/server/notifications';
import { requireViewer } from '@/server/session';
import NotificationsPage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/notifications', () => ({ listNotifications: vi.fn() }));
vi.mock('./actions', () => ({ markAllReadAction: vi.fn(), openNotificationAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const REVIEWER: Me = {
  userId: 'oid-1',
  username: 'pf.reviewer',
  name: 'Reviewer Test',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:read'],
  entities: [],
};

const PAGE: NotificationPage = {
  page: 1,
  pageSize: 20,
  total: 1,
  unread: 1,
  items: [
    {
      id: '66666666-6666-4666-8666-666666666661',
      kind: 'request_received',
      requestId: '11111111-1111-4111-8111-111111111111',
      params: { reference: 'INC-2026-0008', employees: 2, entity: 'SUB-A', actor: 'Alpha HR' },
      actionNeeded: true,
      createdAt: '2026-10-14T12:05:00.000Z',
      read: false,
    },
    {
      id: '66666666-6666-4666-8666-666666666662',
      kind: 'request_submitted',
      requestId: '11111111-1111-4111-8111-111111111112',
      params: { reference: 'INC-2026-0007', employees: 1 },
      actionNeeded: false,
      createdAt: '2026-10-13T09:00:00.000Z',
      read: true,
    },
  ],
};

const notificationsPage = (query: Record<string, string> = {}) =>
  NotificationsPage({ searchParams: Promise.resolve(query) });

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
  vi.mocked(listNotifications).mockResolvedValue({ kind: 'ok', data: PAGE });
});

describe('Notifications page [R1-07, R1-13]', () => {
  it('lists the viewer’s notifications with filters and Mark all as Read', async () => {
    render(await notificationsPage());
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Sirius HR Reviewer')).toBeInTheDocument();
    const filters = screen.getByRole('navigation', { name: 'Filter notifications' });
    expect(within(filters).getByRole('link', { name: 'All' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(filters).getByRole('link', { name: 'Unread (1)' })).toHaveAttribute(
      'href',
      '/notifications?filter=unread',
    );
    const [row, read] = within(screen.getByRole('list', { name: 'Notifications' })).getAllByRole(
      'listitem',
    );
    if (row === undefined || read === undefined) throw new Error('two rows expected');
    expect(read).toHaveAttribute('data-unread', 'false');
    expect(read).toHaveTextContent('Submitted to Sirius HR with 1 employee.');
    expect(within(read).queryByText('Unread')).toBeNull();
    expect(within(row).getByText('Unread')).toHaveClass('sr-only');
    expect(row).toHaveTextContent('Action needed');
    expect(row).toHaveTextContent('INC-2026-0008');
    expect(row).toHaveTextContent(
      'New request from SUB-A with 2 employees, submitted by Alpha HR.',
    );
    expect(row).toHaveTextContent('14 Oct 2026, 16:05');
    expect(row).toHaveAttribute('data-unread', 'true');
    // Something to act on says so.
    expect(within(row).getByRole('button', { name: 'Respond' })).toBeInTheDocument();
    expect(within(read).getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as Read' })).toBeEnabled();
    expect(listNotifications).toHaveBeenCalledWith('all', 1);
    expect(screen.queryByRole('navigation', { name: 'Notification pages' })).toBeNull();
  });

  it('applies the filter and page from the URL, ignoring nonsense', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      kind: 'ok',
      data: { ...PAGE, page: 2, total: 45 },
    });
    render(await notificationsPage({ filter: 'action_needed', page: '2' }));
    expect(listNotifications).toHaveBeenCalledWith('action_needed', 2);
    expect(screen.getByRole('navigation', { name: 'Notification pages' })).toHaveTextContent(
      'Page 2 of 3',
    );
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/notifications?filter=action_needed&page=3',
    );
    await notificationsPage({ filter: 'spam', page: '-4' });
    expect(listNotifications).toHaveBeenLastCalledWith('all', 1);
  });

  it('says when there is nothing, and turns off Mark all as Read', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      kind: 'ok',
      data: { ...PAGE, items: [], total: 0, unread: 0 },
    });
    render(await notificationsPage());
    expect(screen.getByText('No notifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as Read' })).toBeDisabled();
  });

  it('ends the session, shows the error page, or renders nothing, as the API answers', async () => {
    vi.mocked(listNotifications).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(notificationsPage()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(listNotifications).mockResolvedValue({ kind: 'unavailable' });
    await expect(notificationsPage()).rejects.toThrow('Notification API unavailable');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(notificationsPage()).resolves.toBeNull();
  });
});
