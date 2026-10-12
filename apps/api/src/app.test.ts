import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { isProbePath, logLevelFor } from './app.js';
import type { SessionResolver } from './auth/authenticate.js';
import type { Principal } from './auth/principal.js';
import { buildApp, errorOf, silentLogger, testEnv } from './test-support/factory.js';

const groupUser: Principal = { userId: 'u-sirius', roles: ['sirius-hr-reviewer'], scope: 'group' };
const subsidiaryUser: Principal = {
  userId: 'u-sub',
  roles: ['subsidiary-hr'],
  scope: 'entity',
  entityIds: ['entity-a'],
};
const resolveAs =
  (principal: Principal): SessionResolver =>
  () =>
    Promise.resolve(principal);

describe('security headers', () => {
  it('sets a locked-down CSP, HSTS, framing and referrer policies', async () => {
    const res = await request(buildApp()).get('/health/live');
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
    const res = await request(buildApp()).get('/health/live');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('propagates a safe upstream request ID', async () => {
    const res = await request(buildApp()).get('/health/live').set('X-Request-Id', 'abc-12345678');
    expect(res.headers['x-request-id']).toBe('abc-12345678');
  });

  it.each(['short', 'has spaces in it', 'x'.repeat(65), 'line\\nbreak-123'])(
    'replaces an unsafe upstream request ID %j',
    async (unsafe) => {
      const res = await request(buildApp()).get('/health/live').set('X-Request-Id', unsafe);
      expect(res.headers['x-request-id']).not.toBe(unsafe);
    },
  );
});

describe('CORS', () => {
  const app = () => buildApp({ env: testEnv({ CORS_ALLOWED_ORIGINS: 'https://hr.example.ae' }) });

  it('allows a listed origin', async () => {
    const res = await request(app()).get('/health/live').set('Origin', 'https://hr.example.ae');
    expect(res.headers['access-control-allow-origin']).toBe('https://hr.example.ae');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives no CORS grant to an unlisted origin', async () => {
    const res = await request(app()).get('/health/live').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('health endpoints', () => {
  it('reports liveness', async () => {
    const res = await request(buildApp()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'alive' });
  });

  it('is ready when every dependency check passes', async () => {
    const app = buildApp({
      readinessChecks: [{ name: 'database', check: () => Promise.resolve() }],
    });
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', checks: { database: 'up' } });
  });

  it('returns 503 without leaking error detail when a dependency is down', async () => {
    const app = buildApp({
      readinessChecks: [
        { name: 'database', check: () => Promise.resolve() },
        { name: 'cache', check: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:6379')) },
      ],
    });
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', checks: { database: 'up', cache: 'down' } });
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });

  it('returns 503 while shutting down so the load balancer drains traffic', async () => {
    const res = await request(buildApp({ isShuttingDown: () => true })).get('/health/ready');
    expect(res.status).toBe(503);
  });

  it('is not rate limited', async () => {
    const app = buildApp({ env: testEnv({ RATE_LIMIT_MAX: '1' }) });
    await request(app).get('/health/live');
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
  });
});

describe('/api/v1 is deny-by-default', () => {
  it('rejects every request when no identity provider is configured', async () => {
    const res = await request(buildApp()).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it('rejects unknown v1 routes as unauthenticated rather than revealing they do not exist', async () => {
    const res = await request(buildApp()).get('/api/v1/increment-requests');
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown route once authenticated', async () => {
    const app = buildApp({ sessionResolver: resolveAs(groupUser) });
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(errorOf(res)).toMatchObject({ code: 'NOT_FOUND', messageKey: 'errors.NOT_FOUND' });
  });

  it.each([
    ['group-scoped Sirius user', groupUser],
    ['entity-scoped subsidiary user', subsidiaryUser],
  ])('returns the caller identity for a %s', async (_label, principal) => {
    const app = buildApp({ sessionResolver: resolveAs(principal) });
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(principal);
  });
});

describe('request bodies', () => {
  const app = () =>
    buildApp({
      env: testEnv({ REQUEST_BODY_LIMIT_KB: '1' }),
      sessionResolver: resolveAs(groupUser),
    });

  it('rejects malformed JSON with a validation error', async () => {
    const res = await request(app())
      .post('/api/v1/me')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_FAILED');
  });

  it('rejects payloads over the size limit', async () => {
    const res = await request(app())
      .post('/api/v1/me')
      .send({ data: 'x'.repeat(2048) });
    expect(res.status).toBe(413);
    expect(errorOf(res).code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('rate limiting', () => {
  it('returns 429 in the standard error shape once the limit is hit', async () => {
    const app = buildApp({ env: testEnv({ RATE_LIMIT_MAX: '2' }) });
    await request(app).get('/api/v1/me');
    await request(app).get('/api/v1/me');
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe('RATE_LIMITED');
  });
});

describe('unexpected errors', () => {
  it('responds 500 without leaking internals and logs with the request ID', async () => {
    const logger = silentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const app = buildApp({
      logger,
      sessionResolver: () => Promise.reject(new Error('db password=hunter2 rejected')),
    });

    const res = await request(app).get('/api/v1/me');

    expect(res.status).toBe(500);
    expect(errorOf(res)).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(errorOf(res).requestId).toBe(res.headers['x-request-id']);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('logging helpers', () => {
  it.each([
    [200, undefined, 'info'],
    [302, undefined, 'info'],
    [404, undefined, 'warn'],
    [500, undefined, 'error'],
    [200, new Error('stream reset'), 'error'],
  ])('maps status %i with error %s to %s', (status, error, level) => {
    expect(logLevelFor(status, error)).toBe(level);
  });

  it('skips logging for orchestrator probes only', () => {
    expect(isProbePath('/health/ready')).toBe(true);
    expect(isProbePath('/api/v1/me')).toBe(false);
    expect(isProbePath(undefined)).toBe(false);
  });
});
