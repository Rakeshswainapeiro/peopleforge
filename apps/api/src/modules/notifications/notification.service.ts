import {
  NotificationKindSchema,
  type MarkNotificationsRead,
  type Notification,
  type NotificationFilter,
  type NotificationPage,
  type NotificationSummary,
} from '@peopleforge/contracts';
import type { NotificationRecord, NotificationRepository } from '@peopleforge/db';
import { scopeOf, type Principal } from '../../auth/principal.js';

/** Kinds this API version knows; anything newer is left out rather than shown wrongly. */
function toDto(record: NotificationRecord): Notification[] {
  const kind = NotificationKindSchema.safeParse(record.kind);
  if (!kind.success) return [];
  return [
    {
      id: record.id,
      kind: kind.data,
      requestId: record.requestId,
      params: record.params,
      actionNeeded: record.actionNeeded,
      createdAt: record.createdAt.toISOString(),
      read: record.read,
    },
  ];
}

/**
 * A caller's notifications (R1-07, R1-13): their own, and those addressed to a role they hold.
 * Row-Level Security limits role-addressed rows to group scope and entity rows to the caller's
 * subsidiaries.
 */
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async list(
    caller: Principal,
    query: { filter: NotificationFilter; page: number; pageSize: number },
  ): Promise<NotificationPage> {
    const { items, total, unread } = await this.repository.list(scopeOf(caller), {
      roles: caller.roles,
      filter: query.filter,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      items: items.flatMap(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      unread,
    };
  }

  async summary(caller: Principal): Promise<NotificationSummary> {
    const { unread } = await this.repository.list(scopeOf(caller), {
      roles: caller.roles,
      filter: 'unread',
      limit: 1,
      offset: 0,
    });
    return { unread };
  }

  markRead(caller: Principal, input: MarkNotificationsRead): Promise<void> {
    return this.repository.markRead(scopeOf(caller), { roles: caller.roles, ids: input.ids });
  }
}
