import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import RootLayout, { generateMetadata } from './layout';
import Loading from './loading';
import NotFound from './not-found';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/app/actions/set-locale', () => ({ setLocale: vi.fn() }));
vi.mock('@/app/sign-in/actions', () => ({ signOut: vi.fn(), startSignIn: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
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
