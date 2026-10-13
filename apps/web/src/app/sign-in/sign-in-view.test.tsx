import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { navigateTo } from '@/lib/navigate';
import { startSignIn } from './actions';
import { signInContent } from './content';
import { SignInView } from './sign-in-view';

vi.mock('./actions', () => ({ startSignIn: vi.fn() }));
vi.mock('@/lib/navigate', () => ({ navigateTo: vi.fn() }));

const content = signInContent(createTranslator('en'));

beforeEach(() => {
  window.history.replaceState(null, '', '/sign-in');
});

describe('SignInView', () => {
  it('sends the browser to the identity provider', async () => {
    vi.mocked(startSignIn).mockResolvedValue({ ok: true, url: 'https://idp.test/authorize' });
    render(<SignInView {...content} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Sign in with your organisation account' }),
      );
      await Promise.resolve();
    });
    expect(navigateTo).toHaveBeenCalledWith('https://idp.test/authorize');
  });

  it('shows the generic message when sign-in cannot start', async () => {
    vi.mocked(startSignIn).mockResolvedValue({ ok: false });
    render(<SignInView {...content} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Sign in with your organisation account' }),
      );
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in is not available right now.');
  });

  it('removes ?error from the address bar so a refresh does not repeat the failure', () => {
    window.history.replaceState(
      null,
      '',
      '/sign-in?error=access_denied&error_description=x&keep=1',
    );
    render(<SignInView {...content} failure="Sign-in was cancelled." />);
    expect(window.location.search).toBe('?keep=1');
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });
});
