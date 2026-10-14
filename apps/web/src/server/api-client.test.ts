import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest, fetchMe } from './api-client';

const ME = {
  userId: 'oid-1',
  username: 'pf.reviewer',
  name: 'Reviewer Test',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: ['increment_request:decide'],
  entities: [],
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

describe('apiRequest', () => {
  const schema = z.object({ id: z.string() });

  it('sends JSON bodies and idempotency keys', async () => {
    const { fetchImpl, config } = api(Response.json({ id: 'r1' }, { status: 201 }));
    const result = await apiRequest(config, 't', '/api/v1/x', schema, {
      method: 'POST',
      body: { a: 1 },
      idempotencyKey: 'key-12345678',
    });
    expect(result).toEqual({ kind: 'ok', data: { id: 'r1' } });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"a":1}');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('idempotency-key')).toBe('key-12345678');
  });

  it('returns the API’s refusal with its code and details', async () => {
    const refusal = {
      error: {
        code: 'CONFLICT',
        messageKey: 'errors.CONFLICT',
        requestId: 'req-1',
        details: [{ path: 'version', code: 'stale' }],
      },
    };
    const { config } = api(Response.json(refusal, { status: 409 }));
    await expect(apiRequest(config, 't', '/x', schema)).resolves.toEqual({
      kind: 'error',
      status: 409,
      code: 'CONFLICT',
      details: [{ path: 'version', code: 'stale' }],
    });
  });

  it('defaults details to none', async () => {
    const refusal = {
      error: { code: 'NOT_FOUND', messageKey: 'errors.NOT_FOUND', requestId: 'r' },
    };
    const { config } = api(Response.json(refusal, { status: 404 }));
    await expect(apiRequest(config, 't', '/x', schema)).resolves.toMatchObject({ details: [] });
  });

  it.each([
    [
      'a 5xx refusal',
      Response.json(
        { error: { code: 'INTERNAL_ERROR', messageKey: 'e', requestId: 'r' } },
        { status: 500 },
      ),
    ],
    ['an undocumented 4xx body', Response.json({ message: 'nope' }, { status: 400 })],
    ['a non-JSON body', new Response('<html>', { status: 502 })],
  ])('treats %s as unavailable', async (_label, response) => {
    const { config } = api(response);
    await expect(apiRequest(config, 't', '/x', schema)).resolves.toEqual({ kind: 'unavailable' });
  });
});
