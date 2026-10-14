import type { IncrementRequest, Me } from '@peopleforge/contracts';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import type { ApiResult } from '@/server/api-client';
import { getRequest, openCycles, searchEmployees } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import RequestPage from './[id]/page';
import NewRequestPage from './new/page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({
  getRequest: vi.fn(),
  openCycles: vi.fn(),
  searchEmployees: vi.fn(),
}));
vi.mock('./actions', () => ({
  startRequest: vi.fn(),
  addEmployeeAction: vi.fn(),
  removeEmployeeAction: vi.fn(),
  saveDraft: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
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

const DRAFT: IncrementRequest = {
  id: REQUEST,
  reference: 'INC-2026-0007',
  status: 'draft',
  entity: { id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } },
  cycle: { id: CYCLE, name: { en: 'Increment cycle 2026' } },
  version: 2,
  createdAt: '2026-10-14T07:00:00.000Z',
  updatedAt: '2026-10-14T07:00:00.000Z',
  lines: [
    {
      id: '22222222-2222-4222-8222-222222222221',
      employeeId: '33333333-3333-4333-8333-333333333331',
      employeeNumber: 'EMP-1101',
      fullName: 'Aisha Rahman',
      grade: 'G5',
      currency: 'AED',
      currentSalary: '14200.00',
      proposedKind: 'percent',
      proposedValue: '6.00',
      increase: '852.00',
      newSalary: '15052.00',
      percent: '6.00',
    },
  ],
  totals: {
    employees: 1,
    proposed: 1,
    increaseByCurrency: [{ currency: 'AED', amount: '852.00' }],
    averagePercent: '6.0',
  },
};

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
  RequestPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) });

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

describe('Increment request page [R1-02]', () => {
  it('shows the draft with totals, the employee picker and Save draft', async () => {
    render(await requestPage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Increment request INC-2026-0007Draft',
    );
    expect(
      screen.getByText(
        'Increment cycle 2026 · Subsidiary A. Proposals are kept when you save the draft.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    expect(screen.getByTestId('total-increase')).toHaveTextContent(/^AED\s852 \/ month$/u);
    expect(screen.getByTestId('average-percent')).toHaveTextContent('6%');
    expect(screen.getByRole('option', { name: 'Yusuf Karim · EMP-1102 · G6' })).toBeInTheDocument();
    expect(searchEmployees).toHaveBeenCalledWith(SUB_A, REQUEST);
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

  it('is read-only, without Save draft, for people who cannot edit', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...ALPHA_HR,
      permissions: ['increment_request:read'],
    });
    render(await requestPage());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(searchEmployees).not.toHaveBeenCalled();
  });

  it('hides Save draft while the draft is empty', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: { ...DRAFT, lines: [] } });
    render(await requestPage());
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
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
