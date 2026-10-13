import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import RootLayout, { generateMetadata } from './layout';
import Loading from './loading';
import NotFound from './not-found';
import HomePage from './page';
import type { Me } from '@/server/api-client';
import { currentViewer } from '@/server/session';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/app/actions/set-locale', () => ({ setLocale: vi.fn() }));
vi.mock('@/app/sign-in/actions', () => ({ signOut: vi.fn(), startSignIn: vi.fn() }));
vi.mock('@/server/session', () => ({ currentViewer: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const REVIEWER: Me = {
  userId: 'oid-1',
  username: 'pf.reviewer',
  name: 'Reviewer Test',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:decide'],
};

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(currentViewer).mockResolvedValue({ kind: 'ok', me: REVIEWER });
});

describe('RootLayout', () => {
  it.each([
    ['en', 'ltr'],
    ['ar', 'rtl'],
  ] as const)('sets lang=%s and dir=%s on <html>', async (locale, dir) => {
    vi.mocked(getRequestLocale).mockResolvedValue(locale);
    const html = (await RootLayout({ children: null })) as ReactElement<{
      lang: string;
      dir: string;
    }>;
    expect(html.props.lang).toBe(locale);
    expect(html.props.dir).toBe(dir);
  });

  it('provides a skip link to the main content', async () => {
    const html = (await RootLayout({ children: null })) as ReactElement<{
      children: ReactElement<{ children: ReactElement[] }>;
    }>;
    const body = html.props.children;
    render(<div>{body.props.children}</div>);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('keeps the PeopleForge brand name untranslated in Arabic metadata', async () => {
    vi.mocked(getRequestLocale).mockResolvedValue('ar');
    await expect(generateMetadata()).resolves.toMatchObject({ title: 'PeopleForge' });
  });
});

describe('HomePage', () => {
  it('renders the Phase 1 areas and the language switcher', async () => {
    render(await HomePage());
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Increment requests' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('renders Arabic where translated and English fallback elsewhere', async () => {
    vi.mocked(getRequestLocale).mockResolvedValue('ar');
    render(await HomePage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('مرحباً');
    expect(screen.getByRole('heading', { name: 'Increment requests' })).toBeInTheDocument();
  });
});

describe('Loading', () => {
  it('announces loading politely', async () => {
    render(await Loading());
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});

describe('NotFound', () => {
  it('explains the page is unavailable without confirming whether it exists', async () => {
    render(await NotFound());
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText(/do not have access/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });
});

describe('HomePage access', () => {
  it('shows who is signed in and offers sign-out', async () => {
    render(await HomePage());
    expect(screen.getByText('Signed in as Reviewer Test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    [{ name: null }, 'Signed in as pf.reviewer'],
    [{ name: null, username: null }, 'Signed in as oid-1'],
  ])('falls back to the sign-in name, then the ID, for display (%j)', async (patch, text) => {
    vi.mocked(currentViewer).mockResolvedValue({ kind: 'ok', me: { ...REVIEWER, ...patch } });
    render(await HomePage());
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('explains when the role grants no permissions yet', async () => {
    vi.mocked(currentViewer).mockResolvedValue({
      kind: 'ok',
      me: { ...REVIEWER, permissions: [] },
    });
    render(await HomePage());
    expect(screen.getByRole('status')).toHaveTextContent(/doesn't include any permissions/);
  });

  it('sends signed-out visitors to sign-in', async () => {
    vi.mocked(currentViewer).mockResolvedValue({ kind: 'signed_out' });
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT /sign-in');
  });

  it('ends the session when the API no longer accepts its token', async () => {
    vi.mocked(currentViewer).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT /session-ended');
  });

  it('shows a retryable notice when the API is unavailable', async () => {
    vi.mocked(currentViewer).mockResolvedValue({ kind: 'unavailable' });
    render(await HomePage());
    expect(screen.getByRole('alert')).toHaveTextContent('PeopleForge is temporarily unavailable');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });
});
