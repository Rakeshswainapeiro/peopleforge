import type { AuditEventRecord, AuditTrailRepository } from '@peopleforge/db';
import { AuditTrailPageSchema } from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { NotFoundError } from '../../errors/domain-errors.js';
import {
  anonymous,
  buildApp,
  resolveAs,
  SUB_A,
  unusedAuditTrail,
} from '../../test-support/factory.js';
import {
  alphaHr,
  record,
  REQUEST_ID,
  reviewer,
  workingRepository,
} from '../../test-support/increment-requests.js';
import { IncrementRequestService } from '../increment-requests/increment-request.service.js';
import { AuditService } from './audit.service.js';

// The audit trail, read side (R1-15): a request's history and the trail per user.
const EVENT: AuditEventRecord = {
  id: '42',
  at: new Date('2026-10-16T06:00:00Z'),
  actor: 'reviewer',
  actorName: 'Sara Al Mansoori',
  action: 'request_line.approved',
  entityId: SUB_A,
  subjectType: 'request_line',
  subjectId: REQUEST_ID,
  details: {
    requestId: REQUEST_ID,
    changedIncrement: true,
    rows: 2,
    reasonCode: null,
    nested: { x: 1 },
  },
};

type Fake = { [K in keyof AuditTrailRepository]: Mock<AuditTrailRepository[K]> };

function fake(): Fake {
  return {
    requestHistory: vi.fn<AuditTrailRepository['requestHistory']>(() => Promise.resolve([EVENT])),
    trail: vi.fn<AuditTrailRepository['trail']>(() =>
      Promise.resolve({ items: [EVENT], total: 31 }),
    ),
  };
}

function service(
  repository: AuditTrailRepository = fake(),
  status: 'draft' | 'submitted' = 'submitted',
) {
  const requests = workingRepository();
  requests.get.mockResolvedValue(record({ status }));
  return new AuditService(new IncrementRequestService(requests), repository);
}

describe('AuditService [R1-15]', () => {
  it('returns a visible request’s history with flat details only', async () => {
    await expect(service().requestHistory(reviewer, REQUEST_ID)).resolves.toEqual([
      {
        id: '42',
        at: '2026-10-16T06:00:00.000Z',
        actor: 'reviewer',
        actorName: 'Sara Al Mansoori',
        action: 'request_line.approved',
        entityId: SUB_A,
        subjectType: 'request_line',
        subjectId: REQUEST_ID,
        details: { requestId: REQUEST_ID, changedIncrement: true, rows: 2, reasonCode: null },
      },
    ]);
  });

  it('hides a draft’s history from Sirius HR', async () => {
    await expect(
      service(fake(), 'draft').requestHistory(reviewer, REQUEST_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('pages the trail, with whole Dubai days for the dates', async () => {
    const repository = fake();
    const page = await service(repository).trail(reviewer, {
      actor: 'alpha',
      search: 'submitted',
      from: '2026-10-01',
      to: '2026-10-16',
      page: 2,
      pageSize: 25,
    });
    expect(repository.trail.mock.calls[0]?.[1]).toEqual({
      actor: 'alpha',
      search: 'submitted',
      from: new Date('2026-09-30T20:00:00Z'),
      to: new Date('2026-10-16T20:00:00Z'),
      limit: 25,
      offset: 25,
    });
    expect(AuditTrailPageSchema.parse(page)).toMatchObject({ page: 2, total: 31 });
    await service(repository).trail(reviewer, { search: undefined, page: 1, pageSize: 25 });
    expect(repository.trail.mock.calls[1]?.[1]).toMatchObject({ from: undefined, to: undefined });
  });
});

describe('audit routes [R1-15, NFR-SEC-01]', () => {
  async function server(caller: Parameters<typeof resolveAs>[0] | null) {
    const requests = workingRepository();
    requests.get.mockResolvedValue(record({ status: 'submitted' }));
    const app = await buildApp({
      resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
      incrementRequests: requests,
      auditTrail: fake(),
    });
    return app.getHttpServer();
  }

  it('needs a session; the trail needs audit:read, the history only request access', async () => {
    await request(await server(null))
      .get('/api/v1/audit')
      .expect(401);
    await request(await server(null))
      .get(`/api/v1/increment-requests/${REQUEST_ID}/history`)
      .expect(401);
    await request(await server(alphaHr))
      .get('/api/v1/audit')
      .expect(403);
    await request(await server(alphaHr))
      .get(`/api/v1/increment-requests/${REQUEST_ID}/history`)
      .expect(200);
    const res = await request(await server(reviewer))
      .get('/api/v1/audit?search=approved')
      .expect(200);
    expect(AuditTrailPageSchema.parse(res.body).items).toHaveLength(1);
    await request(await server(reviewer))
      .get('/api/v1/audit?from=yesterday')
      .expect(400);
    await request(await server(reviewer))
      .get('/api/v1/increment-requests/x/history')
      .expect(400);
  });

  it('keeps the shared fake honest', async () => {
    await expect(
      unusedAuditTrail.trail({ userId: 'x', kind: 'group' }, { limit: 1, offset: 0 }),
    ).rejects.toThrow();
  });
});
