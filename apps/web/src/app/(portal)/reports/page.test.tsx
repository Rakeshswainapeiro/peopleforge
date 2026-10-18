import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { dashboardSummary, listRequests, openCycles } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import {
  CYCLE_ID,
  dashboardSummaryFixture,
  OPEN_CYCLE,
  requestPage,
  requestSummary,
} from '@/test-support/requests';
import ReportsPage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({
  dashboardSummary: vi.fn(),
  listRequests: vi.fn(),
  openCycles: vi.fn(),
}));
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
const SUB_B = '00000000-0000-4000-8000-0000000e000b';

const ALPHA_HR: Me = {
  userId: 'oid-4',
  username: 'pf.alpha.hr',
  name: 'Alpha HR',
  roles: ['PeopleForge.SubsidiaryHR'],
  scope: 'entity',
  entityIds: [SUB_A],
  permissions: [
    'increment_request:read',
    'increment_request:create',
    'employee_data:read_compensation',
    'report:read_operational',
  ],
  entities: [{ id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } }],
};

const REVIEWER: Me = {
  ...ALPHA_HR,
  userId: 'oid-1',
  username: 'pf.reviewer',
  name: 'Sara',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  entityIds: [],
  permissions: [
    'increment_request:read',
    'increment_request:review',
    'employee_data:read_compensation',
    'report:read_operational',
    'report:read_executive',
  ],
  entities: [
    { id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } },
    { id: SUB_B, code: 'SUB-B', name: { en: 'Subsidiary B' } },
  ],
};

const page = (params: Record<string, string> = {}) =>
  ReportsPage({ searchParams: Promise.resolve(params) });

beforeEach(() => {
  cleanup();
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(ALPHA_HR);
  vi.mocked(openCycles).mockResolvedValue({ kind: 'ok', data: [OPEN_CYCLE] });
  vi.mocked(dashboardSummary).mockResolvedValue({ kind: 'ok', data: dashboardSummaryFixture() });
  vi.mocked(listRequests).mockResolvedValue({
    kind: 'ok',
    data: requestPage([requestSummary({ status: 'submitted', reference: 'INC-2026-0152' })], {
      total: 3,
    }),
  });
});

describe('Reports [R1-14, RP-01]', () => {
  it('previews RP-01 for the open cycle and links Excel and PDF with the same filters', async () => {
    render(await page());
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('3 requests · 7 employees match')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download Excel' })).toHaveAttribute(
      'href',
      `/reports/increment-requests?format=xlsx&cycle=${CYCLE_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      `/reports/increment-requests?format=pdf&cycle=${CYCLE_ID}`,
    );
    expect(screen.getByText(/Every download is recorded in the audit trail/u)).toBeInTheDocument();
    expect(screen.getByText('Preview: the first 1 of 3 requests. The files include them all.'));
    const table = screen.getByRole('table', { name: 'RP-01 · Increment status report' });
    expect(within(table).getByText('INC-2026-0152')).toBeInTheDocument();
    // A subsidiary has no Subsidiary filter; the filters keep the reports path.
    expect(screen.queryByRole('combobox', { name: 'Subsidiary' })).toBeNull();
    expect(screen.getByRole('search')).toHaveAttribute('action', '/reports');
    expect(listRequests).toHaveBeenCalledWith({
      cycleId: CYCLE_ID,
      entityId: undefined,
      status: undefined,
      search: undefined,
      page: 1,
      pageSize: 10,
    });
  });

  it('lets Sirius HR pick a subsidiary and carries every filter into the downloads', async () => {
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    vi.mocked(dashboardSummary).mockResolvedValue({
      kind: 'ok',
      data: dashboardSummaryFixture({ requests: 1, employees: 2 }),
    });
    render(await page({ cycle: 'all', entity: SUB_B, status: 'approved', q: 'Aisha' }));
    expect(screen.getByRole('combobox', { name: 'Subsidiary' })).toHaveValue(SUB_B);
    expect(screen.getByText('1 request · 2 employees match')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      `/reports/increment-requests?format=pdf&cycle=all&entity=${SUB_B}&status=approved&q=Aisha`,
    );
    expect(screen.getByText(/across subsidiaries/u)).toBeInTheDocument();
  });

  it('opens without filters for Sirius HR on every subsidiary', async () => {
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    render(await ReportsPage());
    expect(screen.getByRole('combobox', { name: 'Subsidiary' })).toHaveValue('');
  });

  it('offers no download when nothing matches', async () => {
    vi.mocked(dashboardSummary).mockResolvedValue({
      kind: 'ok',
      data: dashboardSummaryFixture({ requests: 0, employees: 0 }),
    });
    render(await page({ status: 'rejected' }));
    expect(screen.getByText('Nothing to report')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download Excel' })).toBeNull();
  });

  it('shows executives and admins what is coming instead of pay data', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      roles: ['PeopleForge.Executive'],
      permissions: ['report:read_executive'],
    });
    render(await page());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Executive reports' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Coming in a later release.');
    expect(dashboardSummary).not.toHaveBeenCalled();
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      permissions: ['report:read_operational', 'audit:read'],
    });
    cleanup();
    render(await page());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Executive reports' }),
    ).toBeInTheDocument();
  });

  it('answers not found without a report permission, and nothing while the API is down', async () => {
    vi.mocked(requireViewer).mockResolvedValue({ ...ALPHA_HR, permissions: [] });
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(ReportsPage()).resolves.toBeNull();
  });

  it('ends a dead session and fails loudly when the API is down', async () => {
    vi.mocked(openCycles).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(page()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(openCycles).mockResolvedValue({ kind: 'unavailable' });
    await expect(page()).rejects.toThrow('Reports API unavailable');
  });
});
