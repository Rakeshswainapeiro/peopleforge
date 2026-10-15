import { describe, expect, it } from 'vitest';
import {
  MarkNotificationsReadSchema,
  NotificationQuerySchema,
  NotificationSchema,
} from './notifications.js';

const ID = '00000000-0000-4000-8000-0000000e000a';

describe('notification contracts', () => {
  it('defaults the query and bounds the page size', () => {
    expect(NotificationQuerySchema.parse({})).toEqual({ filter: 'all', page: 1, pageSize: 20 });
    expect(NotificationQuerySchema.parse({ filter: 'unread', page: '2' })).toMatchObject({
      filter: 'unread',
      page: 2,
    });
    expect(NotificationQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(NotificationQuerySchema.safeParse({ filter: 'spam' }).success).toBe(false);
  });

  it('marks some or all as read, never an empty list', () => {
    expect(MarkNotificationsReadSchema.parse({})).toEqual({});
    expect(MarkNotificationsReadSchema.parse({ ids: [ID] })).toEqual({ ids: [ID] });
    expect(MarkNotificationsReadSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(MarkNotificationsReadSchema.safeParse({ ids: ['x'] }).success).toBe(false);
  });

  it('accepts a documented notification and refuses unknown kinds', () => {
    const notification = {
      id: ID,
      kind: 'request_submitted',
      requestId: ID,
      params: { reference: 'INC-2026-0001', employees: 2 },
      actionNeeded: false,
      createdAt: '2026-10-14T11:00:00.000Z',
      read: false,
    };
    expect(NotificationSchema.parse(notification)).toEqual(notification);
    expect(NotificationSchema.safeParse({ ...notification, kind: 'x' }).success).toBe(false);
  });
});
