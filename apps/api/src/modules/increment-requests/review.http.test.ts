import { ReviewQueuePageSchema, IncrementRequestSchema } from '@peopleforge/contracts';
import { RequestDataError, type ReviewRepository } from '@peopleforge/db';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { anonymous, buildApp, errorOf, resolveAs, SUB_A } from '../../test-support/factory.js';
import {
  alphaHr,
  CRITERION_1,
  executive,
  LINE_1,
  record,
  REQUEST_ID,
  reviewer,
  workingRepository,
} from '../../test-support/increment-requests.js';

const base = `/api/v1/increment-requests/${REQUEST_ID}`;
const VERIFY = `${base}/lines/${LINE_1}/verifications/${CRITERION_1}`;
const DECIDE = `${base}/lines/${LINE_1}/decision`;
const RESUBMIT = `${base}/resubmit`;
const QUEUE = '/api/v1/review-queue';
const KEY = 'b6a1d1c2-4d0e-4c47-9b8f-0b1d3a2f9e02';

function review(): ReviewRepository {
  return {
    verify: vi.fn(() => Promise.resolve()),
    decide: vi.fn(() => Promise.resolve({ replayed: false })),
    resubmit: vi.fn(() => Promise.resolve({ replayed: false })),
    reminderDays: vi.fn(() => Promise.resolve(2)),
    queue: vi.fn(() =>
      Promise.resolve({
        items: [],
        total: 0,
        counts: {
          all: 0,
          pending: 0,
          returned: 0,
          overdue: 0,
          open: 0,
          openRequests: 0,
          openEntities: 0,
        },
      }),
    ),
  };
}

async function server(caller: Principal | null, repository: ReviewRepository = review()) {
  const requests = workingRepository();
  requests.get.mockResolvedValue(record({ status: 'returned' }));
  const app = await buildApp({
    resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
    incrementRequests: requests,
    review: repository,
  });
  return app.getHttpServer();
}

describe('review routes [R1-07 … R1-09, NFR-SEC-01]', () => {
  it.each([
    ['PUT', VERIFY],
    ['DELETE', VERIFY],
    ['POST', DECIDE],
    ['POST', RESUBMIT],
    ['GET', QUEUE],
  ])('refuses %s %s without a session (401)', async (method, path) => {
    const res = await request(await server(null))
      [method.toLowerCase() as 'get'](path)
      .expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  // Subsidiary HR can't review or decide; reviewers can't resubmit; executives do neither.
  it.each([
    [alphaHr, 'PUT', VERIFY],
    [alphaHr, 'DELETE', VERIFY],
    [alphaHr, 'POST', DECIDE],
    [alphaHr, 'GET', QUEUE],
    [reviewer, 'POST', RESUBMIT],
    [executive, 'POST', DECIDE],
    [executive, 'GET', QUEUE],
  ] as const)('refuses %#: %s %s without the permission (403)', async (caller, method, path) => {
    const res = await request(await server(caller))
      [method.toLowerCase() as 'get'](path)
      .send({})
      .expect(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('verifies and unverifies a criterion, answering with the request', async () => {
    const repository = review();
    const http = await server(reviewer, repository);
    const res = await request(http).put(VERIFY).expect(200);
    expect(IncrementRequestSchema.parse(res.body).id).toBe(REQUEST_ID);
    await request(http).delete(VERIFY).expect(200);
    expect(vi.mocked(repository.verify).mock.calls.map((call) => call[1].verified)).toEqual([
      true,
      false,
    ]);
    await request(http).put(`${base}/lines/not-a-uuid/verifications/${CRITERION_1}`).expect(400);
  });

  it('decides with an Idempotency-Key and a valid body', async () => {
    const repository = review();
    const http = await server(reviewer, repository);
    const missing = await request(http).post(DECIDE).send({ decision: 'approved' }).expect(400);
    expect(errorOf(missing).details).toEqual([{ path: 'Idempotency-Key', code: 'invalid_type' }]);
    const noReason = await request(http)
      .post(DECIDE)
      .set('Idempotency-Key', KEY)
      .send({ decision: 'rejected', comment: 'No.' })
      .expect(400);
    expect(errorOf(noReason).details?.[0]?.path).toBe('reasonCode');
    await request(http)
      .post(DECIDE)
      .set('Idempotency-Key', KEY)
      .send({ decision: 'returned', reasonCode: 'missing_evidence', comment: 'Add C1.' })
      .expect(200);
    expect(vi.mocked(repository.decide).mock.calls[0]?.[1]).toMatchObject({
      decision: 'returned',
      idempotencyKey: KEY,
    });
  });

  it('answers 409 when the employee is no longer pending', async () => {
    const repository = review();
    vi.mocked(repository.decide).mockRejectedValueOnce(new RequestDataError('line_not_pending'));
    const res = await request(await server(reviewer, repository))
      .post(DECIDE)
      .set('Idempotency-Key', KEY)
      .send({ decision: 'approved' })
      .expect(409);
    expect(errorOf(res).details).toEqual([{ path: 'lineId', code: 'not_pending' }]);
  });

  it('resubmits returned employees for subsidiary HR', async () => {
    const repository = review();
    const http = await server(alphaHr, repository);
    await request(http).post(RESUBMIT).set('Idempotency-Key', KEY).send({ version: 3 }).expect(200);
    expect(vi.mocked(repository.resubmit).mock.calls[0]?.slice(1, 3)).toEqual([
      REQUEST_ID,
      expect.objectContaining({ version: 3, note: '', idempotencyKey: KEY }),
    ]);
    await request(http).post(RESUBMIT).set('Idempotency-Key', KEY).send({}).expect(400);
  });

  it('lists the review queue for reviewers', async () => {
    const repository = review();
    const res = await request(await server(reviewer, repository))
      .get(`${QUEUE}?filter=overdue&entityId=${SUB_A}&pageSize=25`)
      .expect(200);
    expect(ReviewQueuePageSchema.parse(res.body)).toMatchObject({ pageSize: 25, reminderDays: 2 });
    expect(vi.mocked(repository.queue).mock.calls[0]?.[1]).toMatchObject({
      filter: 'overdue',
      entityId: SUB_A,
      limit: 25,
    });
    await request(await server(reviewer))
      .get(`${QUEUE}?filter=mine`)
      .expect(400);
  });
});
