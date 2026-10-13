import { createAccessTokenVerifier, IdentityProviderError } from '@sirius/identity';
import { createTestIssuer, type TestIssuer } from '@sirius/identity/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EntityDirectory } from '@peopleforge/db';
import {
  brokenDirectory,
  buildApp,
  errorOf,
  fakeDirectory,
  silentLogger,
  SUB_A,
  TEST_AUDIENCE,
  TEST_ISSUER,
  TEST_TENANT,
} from '../test-support/factory.js';
import { MeSchema, ROLES } from '@peopleforge/access';
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

const ALPHA = '7d6a1c3e-2b4f-4c8a-9e10-000000000004';

async function app(
  logger = silentLogger(),
  directory: EntityDirectory = fakeDirectory({ [ALPHA]: [SUB_A] }),
): Promise<NestExpressApplication> {
  const verifier = createAccessTokenVerifier({
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    tenantId: TEST_TENANT,
    keys: idp.keys,
  });
  return buildApp({
    logger,
    directory,
    resolvePrincipal: tokenResolver({ verifier, logger, directory }),
  });
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

  it('lists every subsidiary for a Sirius role without looking up assignments', async () => {
    const directory = fakeDirectory();
    const lookup = vi.spyOn(directory, 'assignedEntityIds');
    const token = await idp.sign({ roles: [ROLES.admin] });
    const res = await me(await app(silentLogger(), directory), token).expect(200);
    expect((res.body as { entities: { code: string }[] }).entities.map((e) => e.code)).toEqual([
      'SUB-A',
      'SUB-B',
    ]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('scopes a subsidiary HR user to their assigned subsidiaries [R1-01, R2-12]', async () => {
    const token = await idp.sign({ oid: ALPHA, roles: [ROLES.subsidiaryHr] });
    const res = await me(await app(), token).expect(200);
    // The response honours the contract the web app validates against.
    expect(MeSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({
      scope: 'entity',
      entityIds: [SUB_A],
      entities: [{ id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } }],
    });
  });

  it('scopes a subsidiary HR user without assignments to no subsidiaries', async () => {
    const token = await idp.sign({ roles: [ROLES.subsidiaryHr] });
    const res = await me(await app(), token).expect(200);
    expect(res.body).toMatchObject({ scope: 'entity', entityIds: [], entities: [] });
  });

  it('answers 503, never an unscoped caller, when assignments cannot be read', async () => {
    const logger = silentLogger();
    const error = vi.spyOn(logger, 'error');
    const token = await idp.sign({ oid: ALPHA, roles: [ROLES.subsidiaryHr] });
    const res = await me(await app(logger, brokenDirectory), token).expect(503);
    expect(errorOf(res).code).toBe('SERVICE_UNAVAILABLE');
    expect(error).toHaveBeenCalledWith({ errorName: 'Error' }, 'Entity assignments unavailable');
  });

  it('answers 503 when the entity list cannot be read', async () => {
    const directory = { ...fakeDirectory(), entities: brokenDirectory.entities };
    const token = await idp.sign({ roles: [ROLES.reviewer] });
    const res = await me(await app(silentLogger(), directory), token).expect(503);
    expect(errorOf(res).code).toBe('SERVICE_UNAVAILABLE');
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
      resolvePrincipal: tokenResolver({ verifier, logger, directory: fakeDirectory() }),
    });
    const res = await me(server, await idp.sign()).expect(503);
    expect(errorOf(res).code).toBe('SERVICE_UNAVAILABLE');
  });
});
