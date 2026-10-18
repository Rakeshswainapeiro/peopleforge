import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { listAudit } from '@/server/audit';
import { requireViewer } from '@/server/session';
import { auditEvent } from '@/test-support/requests';
import AuditPage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/audit', () => ({ listAudit: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const REVIEWER: Me = {
  userId: 'oid-1',
  username: 'pf.reviewer',
  name: 'Sara',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:review', 'audit:read'],
  entities: [],
};

const page = (params: Record<string, string> = {}) =>
  AuditPage({ searchParams: Promise.resolve(params) });

const trail = (items = [auditEvent()], total = items.length) => ({
  kind: 'ok' as const,
  data: { items, page: 1, pageSize: 25, total },
});

beforeEach(() => {
  cleanup();
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
  vi.mocked(listAudit).mockResolvedValue(trail());
});

describe('Audit trail [R1-15, NFR-AUD-01]', () => {
  it('lists recorded actions with who, what and a link to one person’s actions', async () => {
    render(await page());
    expect(screen.getByRole('heading', { level: 1, name: 'Audit trail' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Audit trail' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('15 Oct 2026, 11:14');
    expect(row).toHaveTextContent('Priya Nair');
    expect(row).toHaveTextContent('Request submitted');
    expect(
      within(table).getByRole('link', { name: 'Show only the actions of Priya Nair' }),
    ).toHaveAttribute('href', '/audit?actor=oid-4');
    expect(screen.getByRole('search', { name: 'Filter the audit trail' })).toHaveAttribute(
      'action',
      '/audit',
    );
    expect(screen.queryByRole('navigation', { name: 'Audit trail pages' })).toBeNull();
    expect(listAudit).toHaveBeenCalledWith({
      search: undefined,
      actor: undefined,
      from: undefined,
      to: undefined,
      page: 1,
    });
  });

  it('filters to one person, keeping them while searching, with a way back to everyone', async () => {
    vi.mocked(listAudit).mockResolvedValue(trail([auditEvent()], 60));
    const { container } = render(
      await page({
        actor: 'oid-4',
        q: 'submitted',
        from: '2026-10-01',
        to: '2026-10-31',
        page: '2',
      }),
    );
    expect(screen.getByText('Actions of Priya Nair')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show everyone' })).toHaveAttribute(
      'href',
      '/audit?q=submitted&from=2026-10-01&to=2026-10-31',
    );
    expect(container.querySelector('input[type="hidden"][name="actor"]')).toHaveValue('oid-4');
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-01');
    expect(screen.getByRole('navigation', { name: 'Audit trail pages' })).toHaveTextContent(
      'Page 2 of 3',
    );
  });

  it('names a person by their ID when this page has none of their entries', async () => {
    vi.mocked(listAudit).mockResolvedValue(trail([], 0));
    render(await page({ actor: 'oid-9' }));
    expect(screen.getByText('Actions of oid-9')).toBeInTheDocument();
    expect(screen.getByText('Nothing recorded')).toBeInTheDocument();
  });

  it('goes to the last page from a link past it', async () => {
    vi.mocked(listAudit).mockResolvedValue(trail([auditEvent()], 30));
    await expect(page({ page: '5' })).rejects.toThrow('NEXT_REDIRECT /audit?page=2');
  });

  it('is not found without audit:read, and handles a dead session or API', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...REVIEWER,
      permissions: ['increment_request:read'],
    });
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(page()).resolves.toBeNull();
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    vi.mocked(listAudit).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(page()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(listAudit).mockResolvedValue({ kind: 'unavailable' });
    await expect(page()).rejects.toThrow('Audit trail unavailable');
  });
});
