import type { NestExpressApplication } from '@nestjs/platform-express';
import { RequestDataError, type IncrementRequestRepository } from '@peopleforge/db';
import { IncrementRequestSchema, IncrementRequestPageSchema } from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { anonymous, buildApp, errorOf, resolveAs, SUB_A } from '../../test-support/factory.js';
import {
  alphaHr,
  CRITERION_1,
  CYCLE_ID,
  EMPLOYEE_1,
  executive,
  LINE_1,
  record,
  REQUEST_ID,
  reviewer,
  workingDashboard,
  workingRepository,
} from '../../test-support/increment-requests.js';

async function app(
  caller: Principal | null,
  repository: IncrementRequestRepository = workingRepository(),
): Promise<NestExpressApplication> {
  return buildApp({
    resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
    incrementRequests: repository,
    dashboard: workingDashboard(),
  });
}

const base = '/api/v1/increment-requests';
const KEY = 'b6a1d1c2-4d0e-4c47-9b8f-0b1d3a2f9e01';

describe('increment request routes [R1-02, NFR-SEC-01]', () => {
  it.each([
    ['GET', base],
    ['POST', base],
    ['GET', `${base}/${REQUEST_ID}`],
    ['POST', `${base}/${REQUEST_ID}/lines`],
    ['DELETE', `${base}/${REQUEST_ID}/lines/${LINE_1}`],
    ['PUT', `${base}/${REQUEST_ID}/draft`],
    ['POST', `${base}/${REQUEST_ID}/submit`],
    ['GET', '/api/v1/increment-cycles/open'],
    ['GET', `/api/v1/employees?entityId=${SUB_A}`],
  ])('refuses %s %s without a session (401)', async (method, path) => {
    const server = (await app(null)).getHttpServer();
    const res = await request(server)[method.toLowerCase() as 'get'](path).expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it.each([
    ['GET', base],
    ['GET', `${base}/${REQUEST_ID}`],
    ['POST', base],
    ['POST', `${base}/${REQUEST_ID}/lines`],
    ['DELETE', `${base}/${REQUEST_ID}/lines/${LINE_1}`],
    ['PUT', `${base}/${REQUEST_ID}/draft`],
    ['POST', `${base}/${REQUEST_ID}/submit`],
    ['GET', `/api/v1/employees?entityId=${SUB_A}`],
  ])('refuses executives %s %s: no individual salaries (403)', async (method, path) => {
    const server = (await app(executive)).getHttpServer();
    const res = await request(server)[method.toLowerCase() as 'get'](path).expect(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it.each([
    ['POST', base],
    ['POST', `${base}/${REQUEST_ID}/lines`],
    ['DELETE', `${base}/${REQUEST_ID}/lines/${LINE_1}`],
    ['PUT', `${base}/${REQUEST_ID}/draft`],
  ])('lets Sirius reviewers read but not %s %s (403)', async (method, path) => {
    const server = (await app(reviewer)).getHttpServer();
    await request(server)[method.toLowerCase() as 'get'](path).expect(403);
  });

  it('creates a draft with an idempotency key (201)', async () => {
    const repository = workingRepository();
    const res = await request((await app(alphaHr, repository)).getHttpServer())
      .post(base)
      .set('Idempotency-Key', KEY)
      .send({ cycleId: CYCLE_ID, employeeIds: [EMPLOYEE_1] })
      .expect(201);
    expect(IncrementRequestSchema.parse(res.body).reference).toBe('INC-2026-0001');
    expect(repository.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: KEY }),
    );
  });

  it.each([
    ['no idempotency key', undefined, { cycleId: CYCLE_ID }, 'Idempotency-Key'],
    ['a malformed idempotency key', 'short', { cycleId: CYCLE_ID }, 'Idempotency-Key'],
    ['an unknown field', KEY, { cycleId: CYCLE_ID, status: 'approved' }, ''],
    ['a non-UUID cycle', KEY, { cycleId: 'cycle-2026' }, 'cycleId'],
  ])('refuses %s (400)', async (_label, key, body, path) => {
    const req = request((await app(alphaHr)).getHttpServer()).post(base);
    const res = await (key === undefined ? req : req.set('Idempotency-Key', key))
      .send(body)
      .expect(400);
    expect(errorOf(res).code).toBe('VALIDATION_FAILED');
    expect(errorOf(res).details?.map((detail) => detail.path)).toContain(path);
  });

  it('reads one request and a page of requests', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    const one = await request(server).get(`${base}/${REQUEST_ID}`).expect(200);
    expect(IncrementRequestSchema.parse(one.body).totals.averagePercent).toBe('8.0');
    const page = await request(server).get(`${base}?status=draft&page=1&pageSize=25`).expect(200);
    expect(IncrementRequestPageSchema.parse(page.body)).toMatchObject({
      page: 1,
      pageSize: 25,
      total: 1,
    });
  });

  it('answers 404 for a request the caller cannot see, and 400 for a malformed ID', async () => {
    const repository = workingRepository();
    repository.get.mockResolvedValue(null);
    const server = (await app(alphaHr, repository)).getHttpServer();
    expect(errorOf(await request(server).get(`${base}/${REQUEST_ID}`).expect(404)).code).toBe(
      'NOT_FOUND',
    );
    await request(server).get(`${base}/not-a-uuid`).expect(400);
  });

  it('adds, removes and prices employees', async () => {
    const repository = workingRepository();
    const server = (await app(alphaHr, repository)).getHttpServer();
    await request(server)
      .post(`${base}/${REQUEST_ID}/lines`)
      .send({ employeeId: EMPLOYEE_1 })
      .expect(201);
    await request(server).delete(`${base}/${REQUEST_ID}/lines/${LINE_1}`).expect(200);
    await request(server)
      .put(`${base}/${REQUEST_ID}/draft`)
      .send({ version: 3, proposals: [{ lineId: LINE_1, kind: 'percent', value: '8' }] })
      .expect(200);
    expect(repository.addLine).toHaveBeenCalledOnce();
    expect(repository.removeLine).toHaveBeenCalledOnce();
    expect(repository.saveDraft).toHaveBeenCalledOnce();
  });

  it('saves one employee’s criteria with the draft and bounds the justification [R1-03]', async () => {
    const repository = workingRepository();
    const server = (await app(alphaHr, repository)).getHttpServer();
    const assessment = (justification: string) => ({
      lineId: LINE_1,
      results: [{ criterionId: CRITERION_1, result: 'fail', justification }],
    });
    await request(server)
      .put(`${base}/${REQUEST_ID}/draft`)
      .send({ version: 3, proposals: [], assessment: assessment('Below the minimum rating.') })
      .expect(200);
    expect(repository.saveDraft).toHaveBeenCalledWith(expect.anything(), REQUEST_ID, {
      version: 3,
      proposals: [],
      assessment: assessment('Below the minimum rating.'),
    });
    const res = await request(server)
      .put(`${base}/${REQUEST_ID}/draft`)
      .send({ version: 3, proposals: [], assessment: assessment('x'.repeat(2001)) })
      .expect(400);
    expect(errorOf(res).details?.[0]?.path).toBe('assessment.results.0.justification');
  });

  it('refuses a proposal value that is not a plain decimal (no floats, no exponents)', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    for (const value of [8, '1e3', '-5', '8.123']) {
      const res = await request(server)
        .put(`${base}/${REQUEST_ID}/draft`)
        .send({ version: 3, proposals: [{ lineId: LINE_1, kind: 'percent', value }] })
        .expect(400);
      expect(errorOf(res).details?.[0]?.path).toBe('proposals.0.value');
    }
  });
});

describe('lookups', () => {
  it('lists open cycles for any signed-in user', async () => {
    const res = await request((await app(executive)).getHttpServer())
      .get('/api/v1/increment-cycles/open')
      .expect(200);
    expect(res.body).toEqual([expect.objectContaining({ id: CYCLE_ID, status: 'open' })]);
  });

  it('searches the caller’s employees and refuses another subsidiary', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    const res = await request(server)
      .get(`/api/v1/employees?entityId=${SUB_A}&search=omar`)
      .expect(200);
    expect(res.body).toEqual([expect.objectContaining({ fullName: 'Omar Haddad' })]);
    expect((res.body as Record<string, unknown>[])[0]).not.toHaveProperty('currentSalary');
    const other = '00000000-0000-4000-8000-0000000e000b';
    expect(
      errorOf(await request(server).get(`/api/v1/employees?entityId=${other}`).expect(403)).code,
    ).toBe('FORBIDDEN');
    await request(server).get('/api/v1/employees').expect(400);
  });
});

describe('submit route [R1-07]', () => {
  it('needs the submit permission, an Idempotency-Key and the version', async () => {
    const server = (await app(reviewer)).getHttpServer();
    await request(server)
      .post(`${base}/${REQUEST_ID}/submit`)
      .set('Idempotency-Key', KEY)
      .send({ version: 3 })
      .expect(403);
    const own = (await app(alphaHr)).getHttpServer();
    const missingKey = await request(own)
      .post(`${base}/${REQUEST_ID}/submit`)
      .send({ version: 3 })
      .expect(400);
    expect(errorOf(missingKey).details?.[0]?.path).toBe('Idempotency-Key');
    const noVersion = await request(own)
      .post(`${base}/${REQUEST_ID}/submit`)
      .set('Idempotency-Key', KEY)
      .send({})
      .expect(400);
    expect(errorOf(noVersion).details?.[0]?.path).toBe('version');
  });

  it('answers 400 naming the employees who are not ready', async () => {
    const res = await request((await app(alphaHr)).getHttpServer())
      .post(`${base}/${REQUEST_ID}/submit`)
      .set('Idempotency-Key', KEY)
      .send({ version: 3 })
      .expect(400);
    expect(errorOf(res).details?.map((detail) => detail.path)).toEqual(['lines.0', 'lines.1']);
  });

  it('answers 409 when the request is no longer a draft', async () => {
    const repository = workingRepository();
    repository.get.mockResolvedValue(record({ status: 'submitted', submittedAt: new Date() }));
    repository.submit.mockRejectedValueOnce(new RequestDataError('not_draft'));
    const res = await request((await app(alphaHr, repository)).getHttpServer())
      .post(`${base}/${REQUEST_ID}/submit`)
      .set('Idempotency-Key', KEY)
      .send({ version: 3 })
      .expect(409);
    expect(errorOf(res).details).toEqual([{ path: 'status', code: 'not_draft' }]);
  });
});
