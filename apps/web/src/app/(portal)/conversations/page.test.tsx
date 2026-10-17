import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { listConversations } from '@/server/conversations';
import { requireViewer } from '@/server/session';
import { conversationPage, ENTITY, LINE_1, REQUEST_ID, threadItem } from '@/test-support/requests';
import ConversationsPage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/conversations', () => ({ listConversations: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const ALPHA: Me = {
  userId: 'alpha',
  username: 'pf.alpha.hr',
  name: 'Alpha HR',
  roles: ['PeopleForge.SubsidiaryHR'],
  scope: 'entity',
  entityIds: [ENTITY],
  permissions: ['increment_request:read', 'increment_request:submit'],
  entities: [{ id: ENTITY, code: 'SUB-A', name: { en: 'Subsidiary A' } }],
};
const REVIEWER: Me = {
  ...ALPHA,
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:read', 'increment_request:review'],
};

const page = (params: Record<string, string> = {}) =>
  ConversationsPage({ searchParams: Promise.resolve(params) });

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(ALPHA);
  vi.mocked(listConversations).mockResolvedValue({ kind: 'ok', data: conversationPage() });
});

describe('Conversations [R1-08]', () => {
  it('lists the threads waiting for the subsidiary, with Respond', async () => {
    render(await page());
    expect(screen.getByRole('heading', { level: 1, name: 'Conversations' })).toBeInTheDocument();
    expect(
      screen.getByText("Sirius HR's questions about your employees, and your answers."),
    ).toBeInTheDocument();
    const chips = screen.getByRole('navigation', { name: 'Show' });
    expect(within(chips).getByRole('link', { name: /Waiting for you/u })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const table = screen.getByRole('table', { name: 'Conversations' });
    expect(table).toHaveTextContent('Sirius HR · Sara Al Mansoori');
    expect(table).toHaveTextContent('Is the 2026 appraisal signed?');
    expect(within(table).getByRole('link', { name: 'Respond about Omar Haddad' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST_ID}/employees/${LINE_1}#conversation`,
    );
    expect(listConversations).toHaveBeenCalledWith({ filter: 'awaiting', page: 1 });
  });

  it('shows Sirius HR every thread, pages, and empty states', async () => {
    vi.mocked(requireViewer).mockResolvedValue(REVIEWER);
    vi.mocked(listConversations).mockResolvedValue({
      kind: 'ok',
      data: conversationPage([threadItem({ awaitingMe: false })], { total: 30 }),
    });
    render(await page({ filter: 'all', page: '2' }));
    expect(
      screen.getByText(
        'Questions and answers about employees, between Sirius HR and the subsidiaries.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the conversation about Omar Haddad' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/conversations?filter=all&page=3',
    );
    cleanup();
    vi.mocked(listConversations).mockResolvedValue({
      kind: 'ok',
      data: conversationPage([], { counts: { all: 0, awaiting: 0 } }),
    });
    render(await page());
    expect(screen.getByText('Nothing waiting for you')).toBeInTheDocument();
    render(await page({ filter: 'all', page: 'x' }));
    expect(screen.getByText('No conversations')).toBeInTheDocument();
  });

  it('goes to the last page past the end, and guards access', async () => {
    vi.mocked(listConversations).mockResolvedValue({
      kind: 'ok',
      data: conversationPage([threadItem()], { total: 3 }),
    });
    await expect(page({ page: '5', filter: 'nonsense' })).rejects.toThrow(
      /^NEXT_REDIRECT \/conversations$/u,
    );
    vi.mocked(listConversations).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(page()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(listConversations).mockResolvedValue({ kind: 'unavailable' });
    await expect(page()).rejects.toThrow('Conversations unavailable');
    vi.mocked(requireViewer).mockResolvedValue({
      ...ALPHA,
      permissions: ['increment_request:read'],
    });
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(page()).resolves.toBeNull();
  });
});
