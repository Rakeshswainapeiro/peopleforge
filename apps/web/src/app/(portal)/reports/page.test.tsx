import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { currentPeriod } from '@/lib/group-view';
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

const rp01 = () => within(screen.getByRole('region', { name: 'RP-01 · Increment status report' }));

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
    expect(rp01().getByRole('combobox', { name: 'Subsidiary' })).toHaveValue(SUB_B);
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
    expect(rp01().getByRole('combobox', { name: 'Subsidiary' })).toHaveValue('');
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

  it('offers subsidiary HR the monthly group reports for their own subsidiary [R2-06]', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...ALPHA_HR,
      permissions: [...ALPHA_HR.permissions, 'employee_data:read'],
    });
    render(await page());
    const section = screen.getByRole('region', { name: 'Group HR reports' });
    const forms = within(section).getAllByRole('form');
    expect(forms.map((form) => form.getAttribute('aria-label'))).toEqual([
      'RP-03 · Headcount & demographics',
      'RP-04 · Compensation & increments',
      'RP-05 · Data quality & anomalies',
    ]);
    const rp03 = within(section).getByRole('form', { name: 'RP-03 · Headcount & demographics' });
    expect(rp03).toHaveAttribute('action', '/reports/group/rp-03');
    expect(rp03).toHaveAttribute('method', 'get');
    // The current month first, as on the dashboards.
    expect(within(rp03).getByRole('combobox', { name: 'Month' })).toHaveValue(
      currentPeriod(new Date()),
    );
    // One subsidiary: no subsidiary choice.
    expect(within(rp03).queryByRole('combobox', { name: 'Subsidiary' })).toBeNull();
    expect(
      within(rp03)
        .getAllByRole('button')
        .map((button) => [
          button.textContent,
          button.getAttribute('name'),
          button.getAttribute('value'),
        ]),
    ).toEqual([
      ['Download Excel', 'format', 'xlsx'],
      ['Download PDF', 'format', 'pdf'],
    ]);
    expect(
      within(
        within(section).getByRole('region', { name: 'RP-03 · Headcount & demographics' }),
      ).getByText('Monthly'),
    ).toBeInTheDocument();
  });

  it('gives Sirius HR every group report, monthly ones by subsidiary [R2-06, R2-07]', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      permissions: [...REVIEWER.permissions, 'employee_data:read'],
    });
    render(await page());
    const section = screen.getByRole('region', { name: 'Group HR reports' });
    expect(within(section).getAllByRole('form')).toHaveLength(5);
    const rp04 = within(section).getByRole('form', { name: 'RP-04 · Compensation & increments' });
    expect(within(rp04).getByRole('combobox', { name: 'Subsidiary' })).toHaveValue('');
    const rp06 = within(section).getByRole('form', { name: 'RP-06 · Quarterly group HR review' });
    expect(within(rp06).getByRole('combobox', { name: 'Quarter' })).toBeInTheDocument();
    expect(within(rp06).queryByRole('combobox', { name: 'Subsidiary' })).toBeNull();
    expect(
      within(rp06)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Download PDF']);
    const rp07 = within(section).getByRole('form', { name: 'RP-07 · Annual HR report' });
    expect(within(rp07).getByRole('combobox', { name: 'Year' })).toBeInTheDocument();
    expect(
      within(within(section).getByRole('region', { name: 'RP-07 · Annual HR report' })).getByText(
        'Annual',
      ),
    ).toBeInTheDocument();
  });

  it('gives executives the quarterly and annual reviews only, no pay data', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      roles: ['PeopleForge.Executive'],
      permissions: ['report:read_executive'],
    });
    render(await page());
    expect(screen.getByText(/Quarterly and annual group HR reviews/u)).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Group HR reports' }))
        .getAllByRole('form')
        .map((form) => form.getAttribute('action')),
    ).toEqual(['/reports/group/rp-06', '/reports/group/rp-07']);
    expect(screen.queryByRole('table')).toBeNull();
    expect(dashboardSummary).not.toHaveBeenCalled();
    expect(openCycles).not.toHaveBeenCalled();
  });

  it('answers not found to readers who can run no report, and nothing while signed out', async () => {
    vi.mocked(requireViewer).mockResolvedValue({ ...ALPHA_HR, permissions: [] });
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    // Admins: the operational-report permission alone runs no report.
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      permissions: ['report:read_operational', 'audit:read'],
    });
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
