import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { reviewQueue } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import { ENTITY, queueItem, queuePage } from '@/test-support/requests';
import ReviewQueuePage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({ reviewQueue: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const REVIEWER: Me = {
  userId: 'oid-1',
  username: 'pf.reviewer',
  name: 'Sara Al Mansoori',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  entityIds: [],
  permissions: ['increment_request:read', 'increment_request:review', 'increment_request:decide'],
  entities: [{ id: ENTITY, code: 'SUB-A', name: { en: 'Subsidiary A' } }],
};

const queue = (params: Record<string, string> = {}) =>
  ReviewQueuePage({ searchParams: Promise.resolve(params) });

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
  vi.mocked(reviewQueue).mockResolvedValue({ kind: 'ok', data: queuePage() });
});

describe('Review queue [R1-07]', () => {
  it('lists employees to review across subsidiaries, with chips, filters and pages', async () => {
    render(await queue());
    expect(screen.getByRole('heading', { level: 1, name: 'Review queue' })).toBeInTheDocument();
    expect(
      screen.getByText('Employees waiting for Sirius HR across 2 subsidiaries. Oldest first.'),
    ).toBeInTheDocument();
    const chips = screen.getByRole('navigation', { name: 'Show' });
    expect(within(chips).getByRole('link', { name: /To review/u })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(chips).getByRole('link', { name: /Past reminder/u })).toHaveAttribute(
      'href',
      '/review?filter=overdue',
    );
    expect(screen.getByRole('search', { name: 'Filter requests' })).toHaveAttribute(
      'action',
      '/review',
    );
    expect(screen.getByRole('combobox', { name: 'Subsidiary' })).toHaveValue('');
    const table = screen.getByRole('table', { name: 'Employees in the review queue' });
    expect(table).toHaveTextContent('Omar Haddad');
    expect(within(table).getByRole('link', { name: 'Review Omar Haddad' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Review queue pages' })).toBeInTheDocument();
    expect(reviewQueue).toHaveBeenCalledWith({
      filter: 'pending',
      entityId: undefined,
      search: undefined,
      page: 1,
      pageSize: 10,
    });
  });

  it('passes the filters on, and goes back to the last page past the end', async () => {
    render(await queue({ filter: 'returned', entity: ENTITY, q: 'Omar', size: '25' }));
    expect(reviewQueue).toHaveBeenCalledWith({
      filter: 'returned',
      entityId: ENTITY,
      search: 'Omar',
      page: 1,
      pageSize: 25,
    });
    vi.mocked(reviewQueue).mockResolvedValue({
      kind: 'ok',
      data: queuePage([queueItem()], { total: 3 }),
    });
    await expect(queue({ page: '9' })).rejects.toThrow(/^NEXT_REDIRECT \/review$/u);
    vi.mocked(reviewQueue).mockResolvedValue({
      kind: 'ok',
      data: queuePage([queueItem()], { total: 30 }),
    });
    cleanup();
    render(await queue({ filter: 'all' }));
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/review?filter=all&page=2',
    );
  });

  it('says when nothing waits, or nothing matches the filters', async () => {
    vi.mocked(reviewQueue).mockResolvedValue({
      kind: 'ok',
      data: queuePage([], {
        counts: {
          all: 0,
          pending: 0,
          returned: 0,
          overdue: 0,
          open: 0,
          openRequests: 0,
          openEntities: 0,
        },
      }),
    });
    render(await queue());
    expect(screen.getByText('Nothing to review')).toBeInTheDocument();
    expect(screen.getByText('Employees waiting for Sirius HR. Oldest first.')).toBeInTheDocument();
    render(await queue({ q: 'Nobody' }));
    expect(screen.getByText('No employees match')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/review');
  });

  it('is for reviewers only, ends a dead session, and fails loudly when the API is down', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      permissions: ['increment_request:read'],
    });
    await expect(queue()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    vi.mocked(reviewQueue).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(queue()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(reviewQueue).mockResolvedValue({ kind: 'unavailable' });
    await expect(queue()).rejects.toThrow('Review queue unavailable');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(queue()).resolves.toBeNull();
  });
});
