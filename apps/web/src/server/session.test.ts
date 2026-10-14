import { getProviderAccessToken } from '@sirius/auth-better';
import { headers } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest, fetchMe } from './api-client';
import { getAuth } from './auth';
import { callApi, currentSession, currentViewer, requireViewer } from './session';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@sirius/auth-better', () => ({ getProviderAccessToken: vi.fn() }));
vi.mock('./api-client', () => ({ fetchMe: vi.fn(), apiRequest: vi.fn() }));
vi.mock('./auth', () => ({ getAuth: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
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

describe('requireViewer', () => {
  const me = {
    userId: 'u-1',
    username: null,
    name: null,
    roles: [],
    scope: 'entity' as const,
    permissions: [],
    entities: [],
  };

  it('sends a visitor without a session to sign-in', async () => {
    getSession.mockResolvedValue(null);
    await expect(requireViewer()).rejects.toThrow('NEXT_REDIRECT /sign-in');
  });

  it('ends a session the API no longer accepts', async () => {
    getSession.mockResolvedValue({ user: { id: 'u-1' } });
    vi.mocked(getProviderAccessToken).mockResolvedValue(null);
    await expect(requireViewer()).rejects.toThrow('NEXT_REDIRECT /session-ended');
  });

  it.each([
    [{ kind: 'ok' as const, me }, me],
    [{ kind: 'unavailable' as const }, null],
  ])('returns the viewer, or null while the API is unavailable', async (result, expected) => {
    getSession.mockResolvedValue({ user: { id: 'u-1' } });
    vi.mocked(getProviderAccessToken).mockResolvedValue('eyJ.token');
    vi.mocked(fetchMe).mockResolvedValue(result);
    await expect(requireViewer()).resolves.toEqual(expected);
  });
});

describe('callApi', () => {
  it('calls the API with the user’s access token', async () => {
    vi.mocked(getProviderAccessToken).mockResolvedValue('eyJ.token');
    vi.mocked(apiRequest).mockResolvedValue({ kind: 'unavailable' });
    const schema = z.object({});
    await callApi('/api/v1/x', schema, { method: 'DELETE' });
    expect(apiRequest).toHaveBeenCalledWith(
      { apiUrl: 'http://api.test', timeoutMs: 2000 },
      'eyJ.token',
      '/api/v1/x',
      schema,
      { method: 'DELETE' },
    );
  });

  it('reports a session without a usable token as unauthenticated', async () => {
    vi.mocked(getProviderAccessToken).mockResolvedValue(null);
    await expect(callApi('/x', z.object({}))).resolves.toEqual({ kind: 'unauthenticated' });
  });
});
