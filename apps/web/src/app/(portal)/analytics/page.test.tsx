import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { getIncrementAnalytics } from '@/server/analytics';
import { openCycles } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import { CYCLE_ID, incrementAnalytics, OPEN_CYCLE } from '@/test-support/requests';
import AnalyticsPage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/analytics', () => ({ getIncrementAnalytics: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({ openCycles: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
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
  name: 'Sara',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:review', 'report:read_operational'],
  entities: [{ id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } }],
};

const page = (params: Record<string, string> = {}) =>
  AnalyticsPage({ searchParams: Promise.resolve(params) });

beforeEach(() => {
  cleanup();
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
  vi.mocked(openCycles).mockResolvedValue({ kind: 'ok', data: [OPEN_CYCLE] });
  vi.mocked(getIncrementAnalytics).mockResolvedValue({ kind: 'ok', data: incrementAnalytics() });
});

describe('Analytics [R1-11, R1-12; DASH-D3, DASH-D4]', () => {
  it('shows TAT for the open cycle: cards, criteria, subsidiaries, requests', async () => {
    render(await page());
    expect(
      screen.getByRole('heading', { level: 1, name: 'TAT and back-and-forth' }),
    ).toBeInTheDocument();
    expect(getIncrementAnalytics).toHaveBeenCalledWith({ cycleId: CYCLE_ID });
    const cards = screen.getByRole('list', { name: 'Key figures' });
    expect(cards).toHaveTextContent('Average TAT4.5 daysMedian 4.5 days · 1 decided');
    const trend = screen.getByRole('table', { name: 'TAT trend, last 12 months' });
    expect(within(trend).getByRole('row', { name: 'Oct 26 4.5 days' })).toBeInTheDocument();
    expect(
      screen.getByText('Average days from submission to decision, by the month decided.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Criterion' })).toHaveValue('');
    expect(
      within(screen.getByRole('table', { name: 'TAT by criterion' })).getAllByRole('row'),
    ).toHaveLength(3);
    expect(screen.getByRole('table', { name: 'Requests, longest first' })).toHaveTextContent(
      '2.5 days · Open',
    );
    expect(screen.getByRole('link', { name: 'Download RP-02 (Excel)' })).toHaveAttribute(
      'href',
      `/analytics/rp-02?cycle=${CYCLE_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Turnaround time' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // No search box here: period and subsidiary only.
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('shows back-and-forth for a subsidiary over every period', async () => {
    const { container } = render(await page({ view: 'flow', cycle: 'all', entity: SUB_A }));
    expect(getIncrementAnalytics).toHaveBeenCalledWith({ entityId: SUB_A });
    expect(screen.getByRole('list', { name: 'Key figures' })).toHaveTextContent(
      'Employees returned1',
    );
    expect(
      screen.getByRole('table', {
        name: 'Requests with back-and-forth, most time with the subsidiary first',
      }),
    ).toHaveTextContent('INC-2026-0152');
    expect(container.querySelector('input[type="hidden"][name="view"]')).toHaveValue('flow');
    expect(screen.queryByRole('combobox', { name: 'Criterion' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Subsidiary' })).toHaveValue(SUB_A);
  });

  it('narrows TAT to one criterion, keeping it across views and in RP-02 [DASH-D3]', async () => {
    render(await page({ criterion: 'C2' }));
    expect(getIncrementAnalytics).toHaveBeenCalledWith({ cycleId: CYCLE_ID, criterion: 'C2' });
    expect(
      screen.getByRole('heading', { name: 'C2 TAT trend, last 12 months' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Average days to verify C2, by the month verified.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Criterion' })).toHaveValue('C2');
    expect(screen.getByRole('link', { name: 'Download RP-02 (Excel)' })).toHaveAttribute(
      'href',
      `/analytics/rp-02?cycle=${CYCLE_ID}&criterion=C2`,
    );
    cleanup();
    const { container } = render(await page({ view: 'flow', criterion: 'C2' }));
    expect(container.querySelector('input[type="hidden"][name="criterion"]')).toHaveValue('C2');
  });

  it('says so when there is nothing to measure, or nothing verified or returned yet', async () => {
    vi.mocked(getIncrementAnalytics).mockResolvedValue({
      kind: 'ok',
      data: incrementAnalytics({
        tat: { ...incrementAnalytics().tat, requests: 0 },
      }),
    });
    render(await page());
    expect(screen.getByText('Nothing to measure yet')).toBeInTheDocument();
    cleanup();
    const quiet = incrementAnalytics();
    quiet.tat.byCriterion = [];
    quiet.backAndForth.byRequest = [];
    vi.mocked(getIncrementAnalytics).mockResolvedValue({ kind: 'ok', data: quiet });
    render(await page());
    expect(screen.getByText('No criteria verified yet.')).toBeInTheDocument();
    cleanup();
    render(await page({ view: 'flow' }));
    expect(screen.getByText('No returns or questions yet.')).toBeInTheDocument();
  });

  it('is Sirius HR’s only, and handles a dead session or API', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      scope: 'entity',
      entityIds: [SUB_A],
    });
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      permissions: ['increment_request:review'],
    });
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(AnalyticsPage()).resolves.toBeNull();
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    vi.mocked(getIncrementAnalytics).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(AnalyticsPage()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(getIncrementAnalytics).mockResolvedValue({ kind: 'unavailable' });
    await expect(page()).rejects.toThrow('Analytics API unavailable');
  });
});
