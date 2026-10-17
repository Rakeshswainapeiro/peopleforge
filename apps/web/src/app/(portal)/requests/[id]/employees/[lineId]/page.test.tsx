import type { IncrementRequest, Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { getThread } from '@/server/conversations';
import { getRequest } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import {
  decisionOf,
  draftRequest,
  ENTITY,
  EVIDENCE_ID,
  LINE_1,
  LINE_2,
  REQUEST_ID,
  submittedRequest,
  threadMessages,
  VERIFIED,
} from '@/test-support/requests';
import EmployeeStatusPage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/increment-requests', () => ({ getRequest: vi.fn() }));
vi.mock('@/server/conversations', () => ({ getThread: vi.fn() }));
vi.mock('@/app/(portal)/conversations/actions', () => ({ postMessageAction: vi.fn() }));
vi.mock('@/app/(portal)/review/actions', () => ({
  verifyAction: vi.fn(),
  decideAction: vi.fn(() => Promise.resolve({})),
}));
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

const statusPage = (lineId = LINE_1, id = REQUEST_ID, query: Record<string, string> = {}) =>
  EmployeeStatusPage({
    params: Promise.resolve({ id, lineId }),
    searchParams: Promise.resolve(query),
  });

beforeEach(() => {
  vi.mocked(getThread).mockResolvedValue({ kind: 'ok', data: [] });
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

const SIRIUS_HR: Me = {
  ...REVIEWER,
  permissions: ['increment_request:read', 'increment_request:review', 'increment_request:decide'],
};

/** Under review: Omar has C1 verified by Sara. */
function inReview(overrides: Partial<IncrementRequest> = {}): IncrementRequest {
  const request = submittedRequest({
    status: 'under_review',
    stage: { kind: 'criterion', criterion: 1, of: 5 },
    ...overrides,
  });
  return {
    ...request,
    lines: request.lines.map((line, index) =>
      index === 0
        ? {
            ...line,
            criteria: line.criteria.map((criterion, at) =>
              at === 0 ? { ...criterion, verification: VERIFIED } : criterion,
            ),
          }
        : line,
    ),
  };
}

describe('Review employee [R1-07 … R1-10]', () => {
  beforeEach(() => {
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_HR);
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: inReview() });
  });

  it('lets a reviewer verify each criterion and decide, from the queue', async () => {
    render(await statusPage());
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Review queue' })).toHaveAttribute(
      'href',
      '/review',
    );
    expect(within(breadcrumb).getByRole('link', { name: 'INC-2026-0152' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Back to review queue' })).toHaveAttribute(
      'href',
      '/review',
    );
    expect(screen.getByText('To review')).toBeInTheDocument();
    // No "waiting" banner for the reviewer: they are the one to act.
    expect(screen.queryByText('Waiting for Sirius HR')).toBeNull();
    const table = screen.getByRole('table', { name: 'Eligibility criteria for Omar Haddad' });
    expect(
      within(table).getByRole('columnheader', { name: 'Sirius HR check' }),
    ).toBeInTheDocument();
    expect(table).toHaveTextContent('Verified by Sara Al Mansoori, 16 Oct 2026');
    expect(
      within(table).getByRole('button', { name: 'Undo the check of C1 for Omar Haddad' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('button', { name: 'Mark C2 verified for Omar Haddad' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Check each criterion and its evidence/u)).toBeInTheDocument();
    const panel = screen.getByRole('region', { name: 'Decision' });
    expect(within(panel).getByText('Verify 4 more criteria before approving.')).toBeInTheDocument();
  });

  it('confirms a decision and offers the next employee, or the queue when none is left', async () => {
    const decided = inReview();
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: {
        ...decided,
        lines: decided.lines.map((line, index) =>
          index === 0
            ? { ...line, reviewStatus: 'approved' as const, decision: decisionOf() }
            : line,
        ),
      },
    });
    render(await statusPage(LINE_1, REQUEST_ID, { decided: 'approved' }));
    expect(screen.getByText('Omar Haddad approved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next employee: Neha Iyer' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST_ID}/employees/${LINE_2}`,
    );
    // Decided: the summary shows, nothing more to verify or decide.
    expect(screen.getByText(/^Approved as proposed: 8%/u)).toBeInTheDocument();
    expect(screen.getByText('By Sara Al Mansoori · 16 Oct 2026, 12:30')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decision' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Undo/u })).toBeNull();

    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: {
        ...decided,
        status: 'partly_approved',
        decidedAt: '2026-10-16T09:00:00.000Z',
        lines: decided.lines.map((line) => ({
          ...line,
          reviewStatus: 'rejected' as const,
          decision: decisionOf({
            decision: 'rejected',
            reasonCode: 'budget',
            comment: 'Over budget.',
          }),
        })),
      },
    });
    render(await statusPage(LINE_1, REQUEST_ID, { decided: 'rejected' }));
    expect(screen.getByText('Every employee of INC-2026-0152 is decided.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Back to review queue' }).length).toBeGreaterThan(1);
    expect(screen.getByText('Reason: Budget')).toBeInTheDocument();
    expect(screen.getByText('Over budget.')).toBeInTheDocument();
  });

  it('shows the subsidiary a returned employee with the question and Update and resubmit', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...PREPARER,
      permissions: [...PREPARER.permissions, 'increment_request:submit'],
    });
    const request = inReview({ status: 'returned' });
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: {
        ...request,
        lines: request.lines.map((line, index) =>
          index === 0
            ? {
                ...line,
                reviewStatus: 'returned' as const,
                decision: decisionOf({
                  decision: 'returned',
                  reasonCode: 'missing_evidence',
                  comment: 'Attach the appraisal.',
                }),
              }
            : line,
        ),
      },
    });
    render(await statusPage(LINE_1, REQUEST_ID, { decided: 'returned' }));
    expect(screen.getByText('Returned to Subsidiary A')).toBeInTheDocument();
    expect(screen.getByText('Attach the appraisal.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update and resubmit' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST_ID}/edit?employee=${LINE_1}`,
    );
    // Only reviewers get the decision confirmation; the subsidiary sees no checks to make.
    expect(screen.queryByText(/returned to Subsidiary A\./u)).toBeNull();
    expect(screen.queryByRole('button', { name: /verified for/u })).toBeNull();
  });

  it('shows why a check failed, from the URL', async () => {
    render(await statusPage(LINE_1, REQUEST_ID, { error: 'request.errors.notPending' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This employee was already decided or returned.',
    );
  });
});

describe('Questions and answers on the employee page [R1-08]', () => {
  it('shows the thread and lets a reviewer ask, with who has to answer', async () => {
    vi.mocked(requireViewer).mockResolvedValue(SIRIUS_HR);
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: inReview() });
    vi.mocked(getThread).mockResolvedValue({ kind: 'ok', data: threadMessages() });
    render(await statusPage());
    const card = screen.getByRole('region', { name: 'Questions and answers' });
    expect(within(card).getByText('Waiting for your answer')).toBeInTheDocument();
    expect(
      within(card).getByRole('list', { name: 'Messages about Omar Haddad' }),
    ).toHaveTextContent('Yes — signed copy attached to C1.');
    expect(
      within(card).getByPlaceholderText('Ask the subsidiary about this employee'),
    ).toBeInTheDocument();
    expect(document.getElementById('conversation')).not.toBeNull();
  });

  it('lets the subsidiary answer, and makes a decided request read-only', async () => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...PREPARER,
      permissions: [...PREPARER.permissions, 'increment_request:submit'],
    });
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: inReview() });
    vi.mocked(getThread).mockResolvedValue({ kind: 'ok', data: threadMessages().slice(0, 1) });
    render(await statusPage());
    expect(screen.getByPlaceholderText('Answer Sirius HR')).toBeInTheDocument();
    expect(screen.getByText('Waiting for your answer')).toBeInTheDocument();
    cleanup();
    vi.mocked(getRequest).mockResolvedValue({
      kind: 'ok',
      data: inReview({ status: 'approved', decidedAt: '2026-10-16T09:00:00.000Z' }),
    });
    vi.mocked(getThread).mockResolvedValue({ kind: 'unavailable' });
    render(await statusPage());
    expect(screen.getByText('No questions yet.')).toBeInTheDocument();
    expect(
      screen.getByText('The review is over: the conversation is read-only.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
  });

  it('has no conversation before submission, and no form for those without a side', async () => {
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: draftRequest() });
    render(await statusPage());
    expect(screen.queryByRole('region', { name: 'Questions and answers' })).toBeNull();
    cleanup();
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    vi.mocked(getRequest).mockResolvedValue({ kind: 'ok', data: inReview() });
    render(await statusPage());
    expect(screen.getByRole('region', { name: 'Questions and answers' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.queryByText(/read-only/u)).toBeNull();
  });
});
