import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import RootLayout, { generateMetadata } from './layout';
import Loading from './loading';
import NotFound from './not-found';
import HomePage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/app/actions/set-locale', () => ({ setLocale: vi.fn() }));

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

  it('localises page metadata', async () => {
    vi.mocked(getRequestLocale).mockResolvedValue('ar');
    await expect(generateMetadata()).resolves.toMatchObject({
      title: 'بوابة الموارد البشرية - سيريوس',
    });
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
