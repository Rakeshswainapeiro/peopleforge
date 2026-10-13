import { getProviderAccessToken } from '@sirius/auth-better';
import { headers } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMe } from './api-client';
import { getAuth } from './auth';
import { currentSession, currentViewer } from './session';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@sirius/auth-better', () => ({ getProviderAccessToken: vi.fn() }));
vi.mock('./api-client', () => ({ fetchMe: vi.fn() }));
vi.mock('./auth', () => ({ getAuth: vi.fn() }));
vi.mock('./env', () => ({
  serverEnv: () => ({ PEOPLEFORGE_API_URL: 'http://api.test', PEOPLEFORGE_API_TIMEOUT_MS: 2000 }),
}));

const requestHeaders = new Headers({ cookie: 'peopleforge.session_token=abc' });
const getSession = vi.fn();

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(requestHeaders);
  vi.mocked(getAuth).mockReturnValue({ api: { getSession } } as never);
});

describe('currentSession', () => {
  it('reads the session without trying to refresh cookies (Server Components cannot set them)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u-1' } });
    await expect(currentSession()).resolves.toEqual({ user: { id: 'u-1' } });
    expect(getSession).toHaveBeenCalledWith({
      headers: requestHeaders,
      query: { disableRefresh: true },
    });
  });
});

describe('currentViewer', () => {
  it('is signed out without a session', async () => {
    getSession.mockResolvedValue(null);
    await expect(currentViewer()).resolves.toEqual({ kind: 'signed_out' });
    expect(getProviderAccessToken).not.toHaveBeenCalled();
  });

  // Bug: after signing out at Keycloak, the refresh token is dead but the PeopleForge session
  // lives on. Reporting "signed out" sent / → /sign-in, and /sign-in (session exists) → /,
  // forever. A session whose token can't be renewed must be ended instead.
  it('treats a session whose provider token cannot be renewed as ended, not signed out', async () => {
    getSession.mockResolvedValue({ user: { id: 'u-1' } });
    vi.mocked(getProviderAccessToken).mockResolvedValue(null);
    await expect(currentViewer()).resolves.toEqual({ kind: 'unauthenticated' });
  });

  it('asks the API who the user is, with their access token', async () => {
    getSession.mockResolvedValue({ user: { id: 'u-1' } });
    vi.mocked(getProviderAccessToken).mockResolvedValue('eyJ.token');
    vi.mocked(fetchMe).mockResolvedValue({ kind: 'unavailable' });
    await expect(currentViewer()).resolves.toEqual({ kind: 'unavailable' });
    expect(fetchMe).toHaveBeenCalledWith(
      { apiUrl: 'http://api.test', timeoutMs: 2000 },
      'eyJ.token',
    );
  });
});
