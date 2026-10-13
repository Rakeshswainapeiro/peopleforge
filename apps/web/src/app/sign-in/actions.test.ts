import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from '@/server/auth';
import { signOut, startSignIn } from './actions';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock('@/server/auth', () => ({ getAuth: vi.fn() }));

const requestHeaders = new Headers({ origin: 'http://localhost:3000' });
const api = { signInSocial: vi.fn(), signOut: vi.fn() };

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(requestHeaders);
  vi.mocked(getAuth).mockReturnValue({ api } as never);
});

describe('startSignIn', () => {
  it('starts organisation sign-in and returns the provider URL', async () => {
    api.signInSocial.mockResolvedValue({ url: 'https://idp.test/authorize?x=1', redirect: true });
    await expect(startSignIn()).resolves.toEqual({
      ok: true,
      url: 'https://idp.test/authorize?x=1',
    });
    expect(api.signInSocial).toHaveBeenCalledWith({
      body: { provider: 'sirius', callbackURL: '/', errorCallbackURL: '/sign-in' },
      headers: requestHeaders,
    });
  });

  it('reports failure without details when there is no URL or the provider is unreachable', async () => {
    api.signInSocial.mockResolvedValueOnce({ redirect: false });
    await expect(startSignIn()).resolves.toEqual({ ok: false });
    api.signInSocial.mockRejectedValueOnce(new Error('discovery failed: ECONNREFUSED'));
    await expect(startSignIn()).resolves.toEqual({ ok: false });
  });
});

describe('signOut', () => {
  it('ends the session and continues to the provider logout', async () => {
    api.signOut.mockResolvedValue({
      success: true,
      url: 'https://idp.test/logout?id_token_hint=x',
    });
    await expect(signOut()).rejects.toThrow(
      'NEXT_REDIRECT https://idp.test/logout?id_token_hint=x',
    );
    expect(api.signOut).toHaveBeenCalledWith({
      body: { callbackURL: '/sign-in', disableRedirect: true },
      headers: requestHeaders,
    });
  });

  it('returns to sign-in when the provider offers no logout', async () => {
    api.signOut.mockResolvedValue({ success: true });
    await expect(signOut()).rejects.toThrow('NEXT_REDIRECT /sign-in');
    expect(redirect).toHaveBeenLastCalledWith('/sign-in');
  });
});
