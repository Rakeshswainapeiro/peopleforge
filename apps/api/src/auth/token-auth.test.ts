import { createAccessTokenVerifier, IdentityProviderError } from '@sirius/identity';
import { createTestIssuer, type TestIssuer } from '@sirius/identity/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildApp,
  errorOf,
  silentLogger,
  TEST_AUDIENCE,
  TEST_ISSUER,
  TEST_TENANT,
} from '../test-support/factory.js';
import { ROLES } from './permissions.js';
import { tokenResolver } from './token-resolver.js';

// End-to-end through the real resolver, guard and filter, with tokens signed by an in-memory
// identity provider shaped like Entra ID (the same claims the local Keycloak realm issues).

let idp: TestIssuer;

beforeAll(async () => {
  idp = await createTestIssuer({
    issuer: TEST_ISSUER,
    tenantId: TEST_TENANT,
    audience: TEST_AUDIENCE,
  });
});

async function app(logger = silentLogger()): Promise<NestExpressApplication> {
  const verifier = createAccessTokenVerifier({
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    tenantId: TEST_TENANT,
    keys: idp.keys,
  });
  return buildApp({ logger, resolvePrincipal: tokenResolver({ verifier, logger }) });
}

function me(server: NestExpressApplication, token?: string) {
  const req = request(server.getHttpServer()).get('/api/v1/me');
  return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
}

describe('bearer-token authentication [NFR-SEC-01]', () => {
  it('signs in a Sirius reviewer with group scope and reviewer permissions', async () => {
    const token = await idp.sign({
      oid: '7d6a1c3e-2b4f-4c8a-9e10-000000000002',
      preferred_username: 'pf.reviewer@sirius.local',
      name: 'PF Reviewer',
      roles: [ROLES.reviewer],
    });
    const res = await me(await app(), token).expect(200);
    expect(res.body).toMatchObject({
      userId: '7d6a1c3e-2b4f-4c8a-9e10-000000000002',
      username: 'pf.reviewer@sirius.local',
      name: 'PF Reviewer',
      roles: [ROLES.reviewer],
      scope: 'group',
    });
    expect((res.body as { permissions: string[] }).permissions).toContain(
      'increment_request:decide',
    );
  });

  it('scopes a subsidiary HR user to no entities until assignments exist [R1-01, R2-12]', async () => {
    const token = await idp.sign({ roles: [ROLES.subsidiaryHr] });
    const res = await me(await app(), token).expect(200);
    expect(res.body).toMatchObject({ scope: 'entity', entityIds: [] });
  });

  it('signs in a user without a PeopleForge role, with no permissions', async () => {
    const res = await me(await app(), await idp.sign({ roles: ['DealForge.CIO'] })).expect(200);
    expect(res.body).toMatchObject({ scope: 'entity', permissions: [] });
  });

  it.each([
    ['expired', () => idp.sign({}, { expiresInSeconds: -600 }), 'expired'],
    ['issued for another app', () => idp.sign({ aud: 'dealforge-web' }), 'wrong_audience'],
    ['from another tenant', () => idp.sign({ tid: 'other-tenant' }), 'wrong_tenant'],
    [
      'signed by an unknown key',
      async () => (await createTestIssuer({ issuer: TEST_ISSUER, audience: TEST_AUDIENCE })).sign(),
      'bad_signature',
    ],
  ])('refuses a token %s with 401 and logs only the reason', async (_label, sign, reason) => {
    const logger = silentLogger();
    const warn = vi.spyOn(logger, 'warn');
    const token = await sign();
    const res = await me(await app(logger), token).expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
    const rejections = warn.mock.calls.filter(([, message]) => message === 'Access token rejected');
    // Exactly the reason: never the token, its claims or the header.
    expect(rejections).toEqual([[{ reason }, 'Access token rejected']]);
  });

  it('refuses a malformed Authorization header', async () => {
    const res = await request((await app()).getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', 'Basic cGY6cGY=')
      .expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it('answers 503 when the identity provider is unreachable, so clients retry', async () => {
    const logger = silentLogger();
    const verifier = {
      verify: () => Promise.reject(new IdentityProviderError('Signing keys unavailable')),
    };
    const server = await buildApp({
      logger,
      resolvePrincipal: tokenResolver({ verifier, logger }),
    });
    const res = await me(server, await idp.sign()).expect(503);
    expect(errorOf(res).code).toBe('SERVICE_UNAVAILABLE');
  });
});
