import { describe, expect, it, vi } from 'vitest';
import { fetchMe } from './api-client';

const ME = {
  userId: 'oid-1',
  username: 'pf.reviewer',
  name: 'Reviewer Test',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:decide'],
};

function api(response: Response | Error) {
  const fetchImpl = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  return { fetchImpl, config: { apiUrl: 'http://api.test', timeoutMs: 1000, fetch: fetchImpl } };
}

describe('fetchMe', () => {
  it('calls the API with the access token server-to-server and returns the caller', async () => {
    const { fetchImpl, config } = api(Response.json(ME));
    await expect(fetchMe(config, 'eyJ.token')).resolves.toEqual({ kind: 'ok', me: ME });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/api/v1/me');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer eyJ.token');
    expect(init?.cache).toBe('no-store');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports 401 as unauthenticated', async () => {
    const { config } = api(new Response(null, { status: 401 }));
    await expect(fetchMe(config, 't')).resolves.toEqual({ kind: 'unauthenticated' });
  });

  it.each([
    ['an error status', new Response(null, { status: 503 })],
    ['an unexpected body', Response.json({ userId: 1 })],
    ['a network failure', new TypeError('fetch failed')],
  ])('reports %s as unavailable', async (_label, response) => {
    const { config } = api(response);
    await expect(fetchMe(config, 't')).resolves.toEqual({ kind: 'unavailable' });
  });

  it('uses the global fetch by default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(ME));
    await expect(
      fetchMe({ apiUrl: 'http://api.test', timeoutMs: 1000 }, 't'),
    ).resolves.toMatchObject({
      kind: 'ok',
    });
    expect(spy).toHaveBeenCalledOnce();
  });
});
