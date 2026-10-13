import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { currentSession } from '@/server/session';
import SignInPage, { generateMetadata } from './page';

vi.mock('@sirius/login-ui/styles.css', () => ({}));
vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ currentSession: vi.fn() }));
vi.mock('./actions', () => ({ startSignIn: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

function params(query: Record<string, string | string[]> = {}) {
  return { searchParams: Promise.resolve(query) };
}

beforeEach(() => {
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(currentSession).mockResolvedValue(null);
});

describe('SignInPage', () => {
  it('shows the PeopleForge sign-in screen', async () => {
    render(await SignInPage(params()));
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('HR Team Portal')).toBeInTheDocument();
    expect(screen.getByText('Increment requests')).toBeInTheDocument();
    expect(screen.getByText('Role-based access')).toBeInTheDocument();
    expect(screen.getByText(/Every sign-in, successful or not, is recorded\./)).toBeInTheDocument();
  });

  it('sends people who are already signed in to the app', async () => {
    vi.mocked(currentSession).mockResolvedValue({ user: { id: 'u-1' } } as never);
    await expect(SignInPage(params())).rejects.toThrow('NEXT_REDIRECT /');
  });

  it.each([
    ['unable_to_get_user_info', /doesn't have access to PeopleForge/],
    ['access_denied', /Sign-in was cancelled\./],
    ['session_expired', /Your session has ended/],
    ['invalid_code', /We could not sign you in\. .*\(Reference: invalid_code\)/],
  ])('explains the sign-in error %s', async (code, message) => {
    render(await SignInPage(params({ error: code })));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('ignores repeated or arbitrary error values', async () => {
    render(await SignInPage(params({ error: ['a', 'b'] })));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    render(await SignInPage(params({ error: 'Call +1 555 0100 to unlock your account now' })));
    expect(screen.getByRole('alert')).not.toHaveTextContent('555');
  });

  it('has a page title', async () => {
    await expect(generateMetadata()).resolves.toEqual({ title: 'Sign in · PeopleForge' });
  });
});
