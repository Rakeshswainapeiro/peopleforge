import type { Notification, NotificationPage } from '@peopleforge/contracts';
import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { notificationRows, notificationsHref } from './notification-view';

const t = createTranslator('en');
const base: Notification = {
  id: '66666666-6666-4666-8666-666666666661',
  kind: 'request_submitted',
  requestId: '11111111-1111-4111-8111-111111111111',
  params: { reference: 'INC-2026-0008', employees: 1 },
  actionNeeded: false,
  createdAt: '2026-10-14T12:05:00.000Z',
  read: false,
};

const page = (items: Notification[]): NotificationPage => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  unread: 1,
});

describe('notificationRows [R1-07]', () => {
  it('words each kind for the reader, with its tag and time', () => {
    const rows = notificationRows(
      page([
        base,
        {
          ...base,
          id: '66666666-6666-4666-8666-666666666662',
          kind: 'request_received',
          params: { reference: 'INC-2026-0008', employees: 3, entity: 'SUB-A', actor: 'Alpha HR' },
          actionNeeded: true,
          read: true,
        },
      ]),
      'en',
      t,
    );
    expect(rows).toEqual([
      {
        id: base.id,
        requestId: base.requestId,
        tag: { tone: 'info', label: 'Status' },
        reference: 'INC-2026-0008',
        message: 'Submitted to Sirius HR with 1 employee.',
        meta: '14 Oct 2026, 16:05',
        unread: true,
      },
      expect.objectContaining({
        tag: { tone: 'warning', label: 'Action needed' },
        message: 'New request from SUB-A with 3 employees, submitted by Alpha HR.',
        unread: false,
      }),
    ]);
  });

  it('tolerates missing values', () => {
    const [row] = notificationRows(page([{ ...base, params: {} }]), 'en', t);
    expect(row).toMatchObject({
      reference: '',
      message: 'Submitted to Sirius HR with 0 employees.',
    });
  });
});

describe('notificationsHref', () => {
  it('keeps the URL short for the defaults', () => {
    expect(notificationsHref('all')).toBe('/notifications');
    expect(notificationsHref('unread')).toBe('/notifications?filter=unread');
    expect(notificationsHref('all', 3)).toBe('/notifications?page=3');
    expect(notificationsHref('action_needed', 2)).toBe(
      '/notifications?filter=action_needed&page=2',
    );
  });
});
