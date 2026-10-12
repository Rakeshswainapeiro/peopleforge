import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ROLES } from '../auth/permissions.js';
import type { Principal } from '../auth/principal.js';
import { buildApp, errorOf, resolveAs, silentLogger, testEnv } from '../test-support/factory.js';

function permissionsOf(res: { body: unknown }): string[] {
  return (res.body as { permissions: string[] }).permissions;
}

const reviewer: Principal = { userId: 'u-sirius', roles: [ROLES.reviewer], scope: 'group' };
const subsidiaryHr: Principal = {
  userId: 'u-sub',
  roles: [ROLES.subsidiaryHr],
  scope: 'entity',
  entityIds: ['entity-alpha'],
};

describe('security headers', () => {
  it('sets a locked-down CSP, HSTS, framing and referrer policies', async () => {
    const res = await request((await buildApp()).getHttpServer()).get('/health/live');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('request IDs', () => {
  it('generates a request ID when none is supplied', async () => {
    const res = await request((await buildApp()).getHttpServer()).get('/health/live');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('propagates a safe upstream request ID', async () => {
    const res = await request((await buildApp()).getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'abc-12345678');
    expect(res.headers['x-request-id']).toBe('abc-12345678');
  });

  it.each(['short', 'has spaces in it', 'x'.repeat(65)])(
    'replaces an unsafe upstream request ID %j',
    async (unsafe) => {
      const res = await request((await buildApp()).getHttpServer())
        .get('/health/live')
        .set('X-Request-Id', unsafe);
      expect(res.headers['x-request-id']).not.toBe(unsafe);
    },
  );
});

describe('CORS', () => {
  const server = async () =>
    (
      await buildApp({ env: testEnv({ CORS_ALLOWED_ORIGINS: 'https://hr.example.ae' }) })
    ).getHttpServer();

  it('allows a listed origin', async () => {
    const res = await request(await server())
      .get('/health/live')
      .set('Origin', 'https://hr.example.ae');
    expect(res.headers['access-control-allow-origin']).toBe('https://hr.example.ae');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives no CORS grant to an unlisted origin', async () => {
    const res = await request(await server())
      .get('/health/live')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('health endpoints', () => {
  it('reports liveness without authentication', async () => {
    const res = await request((await buildApp()).getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'alive' });
  });

  it('is ready when every dependency check passes', async () => {
    const app = await buildApp({
      readinessChecks: [{ name: 'database', check: () => Promise.resolve() }],
    });
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', checks: { database: 'up' } });
  });

  it('returns 503 without leaking error detail when a dependency is down', async () => {
    const app = await buildApp({
      readinessChecks: [
        { name: 'database', check: () => Promise.resolve() },
        { name: 'cache', check: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:6379')) },
      ],
    });
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', checks: { database: 'up', cache: 'down' } });
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });

  it('returns 503 while shutting down so the load balancer drains traffic', async () => {
    const app = await buildApp({ isShuttingDown: () => true });
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', checks: {} });
  });

  it('is not rate limited', async () => {
    const server = (await buildApp({ env: testEnv({ RATE_LIMIT_MAX: '1' }) })).getHttpServer();
    await request(server).get('/health/live');
    const res = await request(server).get('/health/live');
    expect(res.status).toBe(200);
  });
});

describe('/api/v1 is deny-by-default', () => {
  it('rejects every request when no identity provider is configured', async () => {
    const res = await request((await buildApp()).getHttpServer()).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it('rejects unknown v1 routes as unauthenticated rather than revealing they do not exist', async () => {
    const res = await request((await buildApp()).getHttpServer()).get('/api/v1/increment-requests');
    expect(res.status).toBe(401);
  });

  it('returns 404 in the standard shape for an unknown route once authenticated', async () => {
    const app = await buildApp({ sessionResolver: resolveAs(reviewer) });
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(errorOf(res)).toMatchObject({ code: 'NOT_FOUND', messageKey: 'errors.NOT_FOUND' });
  });

  it('returns 404 in the standard shape outside the API', async () => {
    const res = await request((await buildApp()).getHttpServer()).get('/nope');
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });
});

describe('GET /api/v1/me', () => {
  it('returns a group-scoped reviewer with their effective permissions', async () => {
    const app = await buildApp({ sessionResolver: resolveAs(reviewer) });
    const res = await request(app.getHttpServer()).get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'u-sirius', scope: 'group', roles: [ROLES.reviewer] });
    expect(permissionsOf(res)).toContain('increment_request:decide');
    expect(permissionsOf(res)).not.toContain('criteria:configure');
  });

  it('returns an entity-scoped subsidiary user with their entities', async () => {
    const app = await buildApp({ sessionResolver: resolveAs(subsidiaryHr) });
    const res = await request(app.getHttpServer()).get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scope: 'entity', entityIds: ['entity-alpha'] });
    expect(permissionsOf(res)).toContain('increment_request:submit');
    expect(permissionsOf(res)).not.toContain('increment_request:decide');
  });

  it('returns no permissions for a signed-in user without a PeopleForge role', async () => {
    const app = await buildApp({
      sessionResolver: resolveAs({ userId: 'u-none', roles: [], scope: 'group' }),
    });
    const res = await request(app.getHttpServer()).get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(permissionsOf(res)).toEqual([]);
  });
});

describe('request bodies', () => {
  const server = async () =>
    (
      await buildApp({
        env: testEnv({ REQUEST_BODY_LIMIT_KB: '1' }),
        sessionResolver: resolveAs(reviewer),
      })
    ).getHttpServer();

  it('rejects malformed JSON with a validation error', async () => {
    const res = await request(await server())
      .post('/api/v1/me')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_FAILED');
  });

  it('rejects payloads over the size limit', async () => {
    const res = await request(await server())
      .post('/api/v1/me')
      .send({ data: 'x'.repeat(2048) });
    expect(res.status).toBe(413);
    expect(errorOf(res).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('parses a valid body and then routes normally', async () => {
    const res = await request(await server())
      .post('/api/v1/me')
      .send({ ok: true });
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });

  it('does not parse bodies for anonymous callers', async () => {
    const res = await request((await buildApp()).getHttpServer())
      .post('/api/v1/me')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(401);
  });
});

describe('rate limiting', () => {
  it('returns 429 in the standard error shape once the limit is hit', async () => {
    const server = (await buildApp({ env: testEnv({ RATE_LIMIT_MAX: '2' }) })).getHttpServer();
    await request(server).get('/api/v1/me');
    await request(server).get('/api/v1/me');
    const res = await request(server).get('/api/v1/me');
    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe('RATE_LIMITED');
  });
});

describe('unexpected errors', () => {
  it('responds 500 without leaking internals and logs with the request ID', async () => {
    const logger = silentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const app = await buildApp({
      logger,
      sessionResolver: () => Promise.reject(new Error('db password=hunter2 rejected')),
    });

    const res = await request(app.getHttpServer()).get('/api/v1/me');

    expect(res.status).toBe(500);
    expect(errorOf(res).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(errorOf(res).requestId).toBe(res.headers['x-request-id']);
    expect(errorSpy).toHaveBeenCalled();
  });
});
