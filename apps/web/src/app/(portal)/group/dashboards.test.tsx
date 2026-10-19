import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { getCompensation, getExecutiveView, getGroupOverview } from '@/server/group-data';
import type * as GroupData from '@/server/group-data';
import { requireViewer } from '@/server/session';
import {
  ALPHA_HR,
  compensationView,
  EXECUTIVE,
  executiveView,
  groupOverview,
  REVIEWER,
  SUB_A,
} from '@/test-support/group';
import ExecutivePage from '../executive/page';
import CompensationPage from './compensation/page';
import OverviewPage from './overview/page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/group-data', async (importOriginal) => {
  const actual = await importOriginal<typeof GroupData>();
  return {
    required: actual.required,
    getGroupOverview: vi.fn(),
    getCompensation: vi.fn(),
    getExecutiveView: vi.fn(),
  };
});
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/group/overview',
  useSearchParams: () => new URLSearchParams(),
}));

// The group dashboards (R2-05, R2-07): DASH-D5, D6 and D8 in words, with every state.

const ok = <T,>(data: T) => ({ kind: 'ok' as const, data });
const search = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) });

function as(me: Me | null) {
  vi.mocked(requireViewer).mockResolvedValue(me);
}

async function show(page: Promise<React.ReactElement | null>) {
  const element = await page;
  if (element === null) throw new Error('no page');
  return render(element);
}

const card = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  cleanup();
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  as(REVIEWER);
  vi.mocked(getGroupOverview).mockResolvedValue(ok(groupOverview()));
  vi.mocked(getCompensation).mockResolvedValue(ok(compensationView()));
  vi.mocked(getExecutiveView).mockResolvedValue(ok(executiveView()));
});

describe('access [R2-12, NFR-SEC-01]', () => {
  it.each([
    ['overview', () => OverviewPage()],
    ['compensation', () => CompensationPage()],
    ['executive', () => ExecutivePage()],
  ])(
    'the %s page is not found without the permission, empty when signed out',
    async (_name, page) => {
      as({ ...REVIEWER, permissions: [] });
      await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
      as(null);
      await expect(page()).resolves.toBeNull();
    },
  );

  it('keeps the executive view to Sirius roles, even with the permission', async () => {
    as({ ...ALPHA_HR, permissions: ['report:read_executive'] });
    await expect(ExecutivePage()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('Group overview [DASH-D5, R2-05]', () => {
  it('shows headcount, movement and every breakdown for the month asked for', async () => {
    await show(OverviewPage(search({ period: '2026-08', entity: SUB_A, department: 'Finance' })));
    expect(getGroupOverview).toHaveBeenCalledWith({
      period: '2026-08',
      entityId: SUB_A,
      department: 'Finance',
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Group overview' })).toBeInTheDocument();
    expect(
      screen.getByText('September 2026: the data in use for 2 of 2 subsidiaries.'),
    ).toBeInTheDocument();
    expect(screen.getByText('12 last month')).toBeInTheDocument();
    expect(screen.getByText('Turnover 12.9%')).toBeInTheDocument();
    expect(screen.getByText('47.4%')).toBeInTheDocument();
    expect(screen.getByText('9 of 19')).toBeInTheDocument();
    expect(screen.getByLabelText('Subsidiary')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Department')).getByRole('option', { name: 'Sales' }),
    ).toBeInTheDocument();
    const trend = within(card('Headcount, last 12 months')).getByRole('table');
    expect(
      within(trend)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual(['ItemValue', 'Aug 2612', 'Sept 2619', 'Jul 26—']);
    expect(
      within(card('Headcount by subsidiary')).getByRole('row', { name: 'SUB-A 15' }),
    ).toBeInTheDocument();
    expect(
      within(card('Headcount by department')).getByRole('row', { name: 'Sales 5' }),
    ).toBeInTheDocument();
    expect(
      within(card('Gender')).getByRole('row', { name: 'Other / not stated 1' }),
    ).toBeInTheDocument();
    expect(within(card('Age')).getByRole('row', { name: '25–34 5' })).toBeInTheDocument();
    expect(
      within(card('Headcount by grade')).getByRole('row', { name: 'G5 15' }),
    ).toBeInTheDocument();
  });

  it('shows one subsidiary without a subsidiary filter or chart, and no last month', async () => {
    as(ALPHA_HR);
    vi.mocked(getGroupOverview).mockResolvedValue(
      ok(
        groupOverview({
          entities: 1,
          entitiesWithData: 1,
          previousHeadcount: null,
          byEntity: [
            { entity: { id: SUB_A, code: 'SUB-A' }, headcount: 15, joiners: 2, leavers: 1 },
          ],
        }),
      ),
    );
    await show(OverviewPage());
    expect(getGroupOverview).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: undefined, department: undefined }),
    );
    expect(screen.queryByLabelText('Subsidiary')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Headcount by subsidiary' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/last month$/u)).not.toBeInTheDocument();
  });

  it('says when no subsidiary has data for the month', async () => {
    vi.mocked(getGroupOverview).mockResolvedValue(ok(groupOverview({ entitiesWithData: 0 })));
    await show(OverviewPage(search()));
    expect(screen.getByText('No data for this month yet')).toBeInTheDocument();
    expect(screen.queryByText('Headcount')).not.toBeInTheDocument();
  });
});

describe('Compensation trends [DASH-D6, R2-05]', () => {
  it('shows each currency apart, its trend, grades against bands and increments', async () => {
    await show(CompensationPage(search({ period: '2026-09', department: 'Finance' })));
    expect(getCompensation).toHaveBeenCalledWith({
      period: '2026-09',
      entityId: undefined,
      department: 'Finance',
    });
    const aed = screen.getByRole('region', { name: 'Pay in AED' });
    expect(within(aed).getByText('AED 189,000')).toBeInTheDocument();
    expect(within(aed).getByText('+57.5%')).toBeInTheDocument();
    expect(within(aed).getByText('From AED 120,000')).toBeInTheDocument();
    expect(within(aed).getByRole('row', { name: 'Sept 26 189K' })).toBeInTheDocument();
    expect(
      within(aed).getByRole('row', { name: /^G5 AED\s10,000 AED\s9,000 – AED\s12,000$/u }),
    ).toBeInTheDocument();
    const usd = screen.getByRole('region', { name: 'Pay in USD' });
    expect(within(usd).getByText('No data for last month')).toBeInTheDocument();
    expect(within(usd).getByText('—', { selector: 'td' })).toBeInTheDocument();
    expect(within(usd).getByRole('row', { name: /^G5 .*No band$/u })).toBeInTheDocument();
    expect(
      screen.getByText('2026: 2 employees approved in the Increment Portal, 6.5% on average.'),
    ).toBeInTheDocument();
    const cost = screen.getByRole('table', { name: 'Cost of approved increments' });
    expect(
      within(cost).getByRole('row', { name: /^SUB-A 2 AED\s1,300 AED\s15,600$/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Amounts in different currencies are shown separately and never added together.',
      ),
    ).toBeInTheDocument();
  });

  it('shows an empty month and no increments for one subsidiary', async () => {
    as(ALPHA_HR);
    vi.mocked(getCompensation).mockResolvedValue(
      ok(
        compensationView({
          payroll: [],
          grades: [],
          increments: { approved: 0, averagePercent: null, distribution: [], costImpact: [] },
        }),
      ),
    );
    await show(CompensationPage());
    expect(screen.getByText('No data for this month yet')).toBeInTheDocument();
    expect(
      screen.getByText('2026: no increments approved in the Increment Portal yet.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Cost of approved increments' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Subsidiary')).not.toBeInTheDocument();
    expect(screen.queryByText(/never added together/u)).not.toBeInTheDocument();
  });
});

describe('Executive / IHC view [DASH-D8, R2-07]', () => {
  it('shows group totals, payroll per currency, subsidiaries and missing uploads, printable', async () => {
    as(EXECUTIVE);
    await show(ExecutivePage(search({ period: '2026-09' })));
    expect(getExecutiveView).toHaveBeenCalledWith('2026-09');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sirius Group HR · September 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / Save as PDF' })).toBeInTheDocument();
    expect(screen.getByText('+2 / −2')).toBeInTheDocument();
    expect(screen.getByText('12 last month')).toBeInTheDocument();
    expect(screen.getByText('+57.5% from last month')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'By subsidiary' });
    expect(
      within(table).getByRole('row', { name: /^SUB-A 15 AED\s145,000 · USD\s6,000 3$/u }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('row', { name: 'SUB-C Not uploaded — — 0' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Subsidiary')).not.toBeInTheDocument();
  });

  it('copes with a month without payroll or a previous month', async () => {
    as(EXECUTIVE);
    vi.mocked(getExecutiveView).mockResolvedValue(
      ok(
        executiveView({
          payroll: [],
          previousHeadcount: null,
          trend: [{ period: '2026-09', headcount: null }],
        }),
      ),
    );
    await show(ExecutivePage());
    expect(screen.queryByText(/Monthly payroll \(/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/last month$/u)).not.toBeInTheDocument();
    const trend = screen.getByRole('table', { name: 'Headcount, last 12 months' });
    expect(within(trend).getByRole('row', { name: 'Sept 26 —' })).toBeInTheDocument();
  });
});
