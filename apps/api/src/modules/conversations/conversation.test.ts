import type { ConversationRepository } from '@peopleforge/db';
import { ConversationPageSchema } from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { ForbiddenError, NotFoundError } from '../../errors/domain-errors.js';
import {
  anonymous,
  buildApp,
  errorOf,
  resolveAs,
  SUB_A,
  unusedConversations,
} from '../../test-support/factory.js';
import {
  alphaHr,
  executive,
  LINE_1,
  record,
  REQUEST_ID,
  reviewer,
  workingRepository,
} from '../../test-support/increment-requests.js';
import { IncrementRequestService } from '../increment-requests/increment-request.service.js';
import { ConversationService, sideOf } from './conversation.service.js';

// Questions and answers per employee (R1-08) on fakes; the repository's rules, encryption and
// isolation are proven against Postgres in packages/db.
const KEY = 'message-key-0001';
const AT = new Date('2026-10-17T08:00:00Z');
const MESSAGE = {
  id: LINE_1,
  side: 'sirius' as const,
  authorName: 'Sara',
  body: 'Signed?',
  createdAt: AT,
};
const alphaSubmitter: Principal = { ...alphaHr };

type Fake = { [K in keyof ConversationRepository]: Mock<ConversationRepository[K]> };

function fake(): Fake {
  return {
    thread: vi.fn<ConversationRepository['thread']>(() => Promise.resolve([MESSAGE])),
    post: vi.fn<ConversationRepository['post']>(() => Promise.resolve({ replayed: false })),
    threads: vi.fn<ConversationRepository['threads']>(() =>
      Promise.resolve({
        items: [
          {
            lineId: LINE_1,
            request: { id: REQUEST_ID, reference: 'INC-2026-0001', entityCode: 'SUB-A' },
            employeeNumber: 'EMP-3318',
            fullName: 'Omar Haddad',
            messages: 1,
            last: { side: 'sirius', authorName: 'Sara', createdAt: AT, preview: 'Signed?' },
          },
        ],
        total: 1,
        counts: { all: 3, awaiting: 1 },
      }),
    ),
  };
}

function service(repository: ConversationRepository = fake()) {
  const requests = workingRepository();
  requests.get.mockResolvedValue(record({ status: 'under_review' }));
  return new ConversationService(new IncrementRequestService(requests), repository);
}

function noticesOf(repository: Fake, context: object): unknown {
  const input = repository.post.mock.calls[0]?.[1] as { notifications: (c: object) => unknown };
  return input.notifications(context);
}

const context = {
  reference: 'INC-2026-0001',
  entityId: SUB_A,
  requestId: REQUEST_ID,
  lineId: LINE_1,
  employeeName: 'Omar Haddad',
  submittedBy: 'alpha',
};

describe('sideOf', () => {
  it('puts reviewers on Sirius HR’s side and the subsidiary’s HR on theirs', () => {
    expect(sideOf(reviewer)).toBe('sirius');
    expect(sideOf(alphaSubmitter)).toBe('subsidiary');
    expect(sideOf(executive)).toBeNull();
    expect(sideOf({ ...alphaHr, roles: [] })).toBeNull();
  });
});

describe('ConversationService [R1-08]', () => {
  it('reads an employee’s thread of a visible request', async () => {
    const repository = fake();
    await expect(service(repository).thread(reviewer, REQUEST_ID, LINE_1)).resolves.toEqual([
      { ...MESSAGE, createdAt: '2026-10-17T08:00:00.000Z' },
    ]);
    await expect(
      service(repository).thread(reviewer, REQUEST_ID, '22222222-2222-4222-8222-222222222229'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('asks the subsidiary, with action needed, when Sirius HR posts', async () => {
    const repository = fake();
    await service(repository).post(
      reviewer,
      { requestId: REQUEST_ID, lineId: LINE_1 },
      'Signed?',
      KEY,
    );
    expect(repository.post.mock.calls[0]?.[1]).toMatchObject({
      side: 'sirius',
      authorName: 'Reviewer',
      body: 'Signed?',
      idempotencyKey: KEY,
    });
    expect(noticesOf(repository, context)).toEqual([
      {
        entityId: SUB_A,
        requestId: REQUEST_ID,
        recipient: { userId: 'alpha' },
        kind: 'question_asked',
        params: { reference: 'INC-2026-0001', employee: 'Omar Haddad', lineId: LINE_1 },
        actionNeeded: true,
      },
    ]);
    expect(noticesOf(repository, { ...context, submittedBy: null })).toEqual([]);
  });

  it('tells the reviewers when the subsidiary answers', async () => {
    const repository = fake();
    await service(repository).post(
      alphaSubmitter,
      { requestId: REQUEST_ID, lineId: LINE_1 },
      'Yes.',
      KEY,
    );
    expect(noticesOf(repository, context)).toEqual([
      expect.objectContaining({
        recipient: { role: 'PeopleForge.Reviewer' },
        kind: 'question_answered',
        params: expect.objectContaining({ actor: 'Alpha HR' }) as unknown,
      }),
    ]);
  });

  it('refuses anyone without a side', async () => {
    await expect(
      service().post(executive, { requestId: REQUEST_ID, lineId: LINE_1 }, 'Hi', KEY),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lists threads with who has to answer, from the caller’s side', async () => {
    const repository = fake();
    const page = await service(repository).threads(alphaSubmitter, {
      filter: 'awaiting',
      page: 2,
      pageSize: 10,
    });
    expect(repository.threads.mock.calls[0]?.[1]).toEqual({
      side: 'subsidiary',
      filter: 'awaiting',
      limit: 10,
      offset: 10,
    });
    expect(ConversationPageSchema.parse(page).items[0]).toMatchObject({
      awaitingMe: true,
      last: { createdAt: '2026-10-17T08:00:00.000Z' },
    });
    await service(repository).threads(reviewer, { filter: 'all', page: 1, pageSize: 10 });
    expect(repository.threads.mock.calls[1]?.[1]).toMatchObject({ side: 'sirius' });
    const forExecutive = await service(repository).threads(executive, {
      filter: 'all',
      page: 1,
      pageSize: 10,
    });
    expect(forExecutive.items[0]?.awaitingMe).toBe(false);
    await service(repository).threads(
      { ...alphaHr, roles: [] },
      {
        filter: 'all',
        page: 1,
        pageSize: 10,
      },
    );
    expect(repository.threads.mock.calls[3]?.[1]).toMatchObject({ side: 'subsidiary' });
  });
});

describe('conversation routes [R1-08, NFR-SEC-01]', () => {
  const base = `/api/v1/increment-requests/${REQUEST_ID}/lines/${LINE_1}/messages`;

  async function server(caller: Principal | null, repository: ConversationRepository = fake()) {
    const requests = workingRepository();
    requests.get.mockResolvedValue(record({ status: 'under_review' }));
    const app = await buildApp({
      resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
      incrementRequests: requests,
      conversations: repository,
    });
    return app.getHttpServer();
  }

  it.each([
    ['GET', base],
    ['POST', base],
    ['GET', '/api/v1/conversations'],
  ])('refuses %s %s without a session (401)', async (method, path) => {
    const res = await request(await server(null))
      [method.toLowerCase() as 'get'](path)
      .expect(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it('refuses a role without request access (403), and an executive posting', async () => {
    const noRole: Principal = { ...alphaHr, roles: [] };
    await request(await server(noRole))
      .get('/api/v1/conversations')
      .expect(403);
    const res = await request(await server(executive))
      .post(base)
      .set('Idempotency-Key', KEY)
      .send({ body: 'Hi' })
      .expect(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('posts with a key and a body, and lists threads', async () => {
    const http = await server(reviewer);
    const sent = await request(http)
      .post(base)
      .set('Idempotency-Key', KEY)
      .send({ body: ' Signed? ' })
      .expect(200);
    expect(sent.body).toHaveLength(1);
    await request(http).post(base).send({ body: 'x' }).expect(400);
    await request(http).post(base).set('Idempotency-Key', KEY).send({ body: '' }).expect(400);
    await request(http).get(base).expect(200);
    const list = await request(http).get('/api/v1/conversations?filter=all').expect(200);
    expect(ConversationPageSchema.parse(list.body).counts).toEqual({ all: 3, awaiting: 1 });
    await request(http).get('/api/v1/conversations?filter=mine').expect(400);
  });

  it('keeps the shared fake honest', async () => {
    await expect(
      unusedConversations.threads({ userId: 'x', kind: 'group' }, {} as never),
    ).rejects.toThrow();
  });
});
