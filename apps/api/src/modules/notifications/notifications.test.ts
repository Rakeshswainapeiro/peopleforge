import type { NotificationRepository } from '@peopleforge/db';
import { NotificationPageSchema } from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { anonymous, buildApp, errorOf, resolveAs } from '../../test-support/factory.js';
import { alphaHr, executive, REQUEST_ID, reviewer } from '../../test-support/increment-requests.js';
import { NotificationService } from './notification.service.js';

const NOTE = '66666666-6666-4666-8666-666666666661';

function repository(): NotificationRepository & {
  list: ReturnType<typeof vi.fn>;
  markRead: ReturnType<typeof vi.fn>;
} {
  return {
    list: vi.fn(() =>
      Promise.resolve({
        total: 2,
        unread: 1,
        items: [
          {
            id: NOTE,
            kind: 'request_received',
            requestId: REQUEST_ID,
            params: { reference: 'INC-2026-0001', employees: 2, entity: 'SUB-A', actor: 'Alpha' },
            actionNeeded: true,
            createdAt: new Date('2026-10-14T11:00:00Z'),
            read: false,
          },
          {
            id: '66666666-6666-4666-8666-666666666662',
            kind: 'from_a_newer_version',
            requestId: null,
            params: {},
            actionNeeded: false,
            createdAt: new Date('2026-10-14T10:00:00Z'),
            read: true,
          },
        ],
      }),
    ),
    markRead: vi.fn(() => Promise.resolve()),
  };
}

async function app(caller: Principal | null, notifications = repository()) {
  return buildApp({
    resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
    notifications,
  });
}

const base = '/api/v1/notifications';

describe('NotificationService [R1-07, R1-13]', () => {
  it('pages the caller’s notifications, matching role-addressed ones on their roles', async () => {
    const repo = repository();
    const page = await new NotificationService(repo).list(reviewer, {
      filter: 'action_needed',
      page: 2,
      pageSize: 10,
    });
    expect(repo.list).toHaveBeenCalledWith(
      { userId: 'reviewer', kind: 'group' },
      { roles: reviewer.roles, filter: 'action_needed', limit: 10, offset: 10 },
    );
    // A kind this version doesn't know is left out.
    expect(page).toEqual({
      page: 2,
      pageSize: 10,
      total: 2,
      unread: 1,
      items: [
        {
          id: NOTE,
          kind: 'request_received',
          requestId: REQUEST_ID,
          params: { reference: 'INC-2026-0001', employees: 2, entity: 'SUB-A', actor: 'Alpha' },
          actionNeeded: true,
          createdAt: '2026-10-14T11:00:00.000Z',
          read: false,
        },
      ],
    });
  });

  it('counts unread for the bell, and marks some or all read', async () => {
    const repo = repository();
    const service = new NotificationService(repo);
    await expect(service.summary(alphaHr)).resolves.toEqual({ unread: 1 });
    await service.markRead(alphaHr, { ids: [NOTE] });
    await service.markRead(alphaHr, {});
    expect(repo.markRead.mock.calls).toEqual([
      [
        {
          userId: 'alpha',
          kind: 'entity',
          entityIds: alphaHr.scope === 'entity' ? alphaHr.entityIds : [],
        },
        { roles: alphaHr.roles, ids: [NOTE] },
      ],
      [
        {
          userId: 'alpha',
          kind: 'entity',
          entityIds: alphaHr.scope === 'entity' ? alphaHr.entityIds : [],
        },
        { roles: alphaHr.roles, ids: undefined },
      ],
    ]);
  });
});

describe('notification routes', () => {
  it.each([
    ['GET', base],
    ['GET', `${base}/summary`],
    ['POST', `${base}/read`],
  ])('refuses %s %s without a session (401)', async (method, path) => {
    const server = (await app(null)).getHttpServer();
    const res = await request(server)[method.toLowerCase() as 'get'](path).expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it('serves any signed-in user, executives included', async () => {
    const server = (await app(executive)).getHttpServer();
    const res = await request(server).get(`${base}?filter=unread&page=1&pageSize=5`).expect(200);
    expect(NotificationPageSchema.parse(res.body).items).toHaveLength(1);
    await request(server).get(`${base}/summary`).expect(200, { unread: 1 });
    await request(server)
      .post(`${base}/read`)
      .send({ ids: [NOTE] })
      .expect(204);
    await request(server).post(`${base}/read`).send({}).expect(204);
  });

  it('validates the query and body', async () => {
    const server = (await app(alphaHr)).getHttpServer();
    await request(server).get(`${base}?filter=everything`).expect(400);
    await request(server).post(`${base}/read`).send({ ids: [] }).expect(400);
    await request(server)
      .post(`${base}/read`)
      .send({ ids: ['x'], extra: 1 })
      .expect(400);
  });
});
