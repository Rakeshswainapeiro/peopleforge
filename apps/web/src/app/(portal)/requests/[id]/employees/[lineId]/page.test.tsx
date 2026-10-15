import type { Me } from '@peopleforge/contracts';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { getRequest } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import {
  draftRequest,
  ENTITY,
  EVIDENCE_ID,
  LINE_1,
  LINE_2,
  REQUEST_ID,
} from '@/test-support/requests';
import EmployeeStatusPage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({ getRequest: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const PREPARER: Me = {
  userId: 'oid-4',
  username: 'pf.alpha.hr',
  name: 'Alpha HR',
  roles: ['PeopleForge.SubsidiaryHR'],
  scope: 'entity',
  entityIds: [ENTITY],
  permissions: ['increment_request:create', 'increment_request:read'],
  entities: [{ id: ENTITY, code: 'SUB-A', name: { en: 'Subsidiary A' } }],
};
const REVIEWER: Me = {
  ...PREPARER,
  userId: 'oid-1',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:read'],
  entities: [],
};
const SUBMITTED = draftRequest({ status: 'submitted', submittedAt: '2026-10-10T06:00:00.000Z' });

const statusPage = (lineId = LINE_1, id = REQUEST_ID) =>
  EmployeeStatusPage({ params: Promise.resolve({ id, lineId }) });

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(PREPARER);
  vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: SUBMITTED });
});

describe('Employee status [R1-06, R1-07]', () => {
  it('shows one employee’s increment, criteria and progress, read-only', async () => {
    render(await statusPage());
    expect(screen.getByRole('heading', { level: 1, name: 'Omar Haddad' })).toBeInTheDocument();
    expect(
      screen.getByText('EMP-3318 · G7 · Subsidiary A · request INC-2026-0001'),
    ).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'My requests' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Back to my requests' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Waiting for Sirius HR')).toBeInTheDocument();
    expect(
      screen.getByText('Sent to Sirius HR on 10 Oct 2026. Review has not started yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 of 5')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Progress' })).toHaveTextContent('Review in progress');

    const table = screen.getByRole('table', { name: 'Eligibility criteria for Omar Haddad' });
    expect(table).toHaveTextContent('C1 · [Placeholder] Criterion 1');
    expect(table).toHaveTextContent('Rated 4 of 5 in the 2026 appraisal.');
    expect(
      within(table).getByRole('link', { name: 'Download appraisal-2026.pdf' }),
    ).toHaveAttribute('href', `/requests/${REQUEST_ID}/evidence/${EVIDENCE_ID}`);
    expect(screen.getByText('As submitted by you for Omar Haddad')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Continue draft' })).toBeNull();
  });

  it('says a draft isn’t with Sirius HR yet, and lets its preparer continue it', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: draftRequest() });
    render(await statusPage(LINE_2));
    expect(screen.getByText('Not submitted yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue draft' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST_ID}/edit`,
    );
    expect(screen.getByText('Not proposed yet')).toBeInTheDocument();
    // Neha has no files yet.
    expect(screen.getAllByText('None').length).toBeGreaterThan(0);
  });

  it('names the subsidiary for Sirius HR, who can’t continue a draft', async () => {
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    render(await statusPage());
    expect(screen.getByText('As submitted by Subsidiary A for Omar Haddad')).toBeInTheDocument();
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: draftRequest() });
    render(await statusPage());
    expect(screen.queryByRole('link', { name: 'Continue draft' })).toBeNull();
  });

  it.each([
    ['a malformed request ID', () => statusPage(LINE_1, '../me')],
    ['a malformed employee ID', () => statusPage('x')],
    ['an employee not in the request', () => statusPage('22222222-2222-4222-8222-222222222229')],
  ])('answers not found for %s', async (_label, open) => {
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('answers not found for a request the API hides, or a role that can’t read requests', async () => {
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'error',
      status: 404,
      code: 'NOT_FOUND',
      details: [],
    });
    await expect(statusPage()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue({ ...REVIEWER, permissions: [] });
    await expect(statusPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('ends a dead session, fails loudly when the API is down, and renders nothing signed out', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(statusPage()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(getRequest).mockResolvedValue({ kind: 'unavailable' });
    await expect(statusPage()).rejects.toThrow('Increment request API unavailable');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(statusPage()).resolves.toBeNull();
  });
});
