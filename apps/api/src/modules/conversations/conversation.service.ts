import {
  ROLES,
  type ConversationPage,
  type ConversationQuery,
  type Message,
  type MessageSide,
} from '@peopleforge/contracts';
import { RequestDataError, type ConversationRepository } from '@peopleforge/db';
import { permissionsOfPrincipal, scopeOf, type Principal } from '../../auth/principal.js';
import { ForbiddenError } from '../../errors/domain-errors.js';
import {
  actorName,
  guard,
  toDomainError,
  type IncrementRequestService,
} from '../increment-requests/increment-request.service.js';

/**
 * Which side of the conversation the caller is on: Sirius HR reviewers ask, the subsidiary's
 * HR answers. Others (executives) only read; posting is forbidden.
 */
export function sideOf(caller: Principal): MessageSide | null {
  const permissions = permissionsOfPrincipal(caller);
  if (caller.scope === 'group') {
    return permissions.has('increment_request:review') ? 'sirius' : null;
  }
  return permissions.has('increment_request:submit') ? 'subsidiary' : null;
}

/**
 * Questions and answers per employee (R1-08). Reading needs the request to be visible (its own
 * check, then Row-Level Security); posting needs the caller's side and a request in review.
 */
export class ConversationService {
  constructor(
    private readonly requests: IncrementRequestService,
    private readonly repository: ConversationRepository,
  ) {}

  /** The employee's messages, after checking the caller can see the request and employee. */
  async thread(caller: Principal, requestId: string, lineId: string): Promise<Message[]> {
    const request = await this.requests.get(caller, requestId);
    if (!request.lines.some((line) => line.id === lineId)) {
      throw toDomainError(new RequestDataError('line_not_found'));
    }
    const messages = await this.repository.thread(scopeOf(caller), requestId, lineId);
    return messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() }));
  }

  /**
   * Posts a question (Sirius HR) or an answer (the subsidiary); the other side is notified with
   * action needed. A repeated Idempotency-Key is a replay. Returns the thread.
   */
  async post(
    caller: Principal,
    target: { requestId: string; lineId: string },
    body: string,
    idempotencyKey: string,
  ): Promise<Message[]> {
    const side = sideOf(caller);
    if (side === null) throw new ForbiddenError('Only Sirius HR reviewers and the subsidiary post');
    await guard(
      this.repository.post(scopeOf(caller), {
        ...target,
        side,
        authorName: actorName(caller),
        body,
        idempotencyKey,
        notifications: (context) => {
          const params = {
            reference: context.reference,
            employee: context.employeeName,
            lineId: context.lineId,
          };
          const about = { entityId: context.entityId, requestId: context.requestId };
          if (side === 'subsidiary') {
            return [
              {
                ...about,
                recipient: { role: ROLES.reviewer },
                kind: 'question_answered',
                params: { ...params, actor: actorName(caller) },
                actionNeeded: true,
              },
            ];
          }
          return context.submittedBy === null
            ? []
            : [
                {
                  ...about,
                  recipient: { userId: context.submittedBy },
                  kind: 'question_asked',
                  params,
                  actionNeeded: true,
                },
              ];
        },
      }),
    );
    return this.thread(caller, target.requestId, target.lineId);
  }

  /** The Conversations page: threads, latest first, and how many wait for the caller. */
  async threads(caller: Principal, query: ConversationQuery): Promise<ConversationPage> {
    // Executives have no side: everything they see is "all", nothing waits for them.
    const side = sideOf(caller) ?? (caller.scope === 'group' ? 'sirius' : 'subsidiary');
    const result = await this.repository.threads(scopeOf(caller), {
      side,
      filter: query.filter,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      counts: result.counts,
      items: result.items.map((item) => ({
        ...item,
        awaitingMe: item.last.side !== side,
        last: { ...item.last, createdAt: item.last.createdAt.toISOString() },
      })),
    };
  }
}
