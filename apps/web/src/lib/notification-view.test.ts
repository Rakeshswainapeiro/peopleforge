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
        lineId: null,
        tag: { tone: 'info', label: 'Status' },
        reference: 'INC-2026-0008',
        message: 'Submitted to Sirius HR with 1 employee.',
        meta: '14 Oct 2026, 16:05',
        unread: true,
        action: 'View',
      },
      expect.objectContaining({
        tag: { tone: 'warning', label: 'Action needed' },
        action: 'Respond',
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

describe('review notifications [R1-08 … R1-10]', () => {
  it('words the stage, each decision and the final status', () => {
    const rows = notificationRows(
      page([
        {
          ...base,
          kind: 'stage_changed',
          params: { reference: 'INC-2026-0152', criterion: 3, of: 5 },
        },
        {
          ...base,
          kind: 'employee_returned',
          params: { reference: 'INC-2026-0152', employee: 'Aisha Rahman' },
          actionNeeded: true,
        },
        {
          ...base,
          kind: 'request_decided',
          params: { reference: 'INC-2026-0152', status: 'partly_approved' },
        },
        {
          ...base,
          kind: 'request_decided',
          params: { reference: 'INC-2026-0152', status: 'nonsense' },
        },
        { ...base, kind: 'stage_changed', params: {} },
      ]),
      'en',
      t,
    );
    expect(rows.map((row) => row.message)).toEqual([
      'Sirius HR verified criterion 2 for every employee. Criterion 3 of 5 is under review.',
      'Aisha Rahman returned by Sirius HR with a question. Update and resubmit.',
      'Every employee decided. Final status: Partly approved.',
      'Every employee decided. Final status: .',
      'Sirius HR verified criterion 0 for every employee. Criterion 0 of 0 is under review.',
    ]);
    expect(rows[1]?.action).toBe('Respond');
  });
});

describe('question notifications [R1-08]', () => {
  it('words reminders on configured triggers, the deadline as a date [R1-13]', () => {
    const rows = notificationRows(
      page([
        {
          ...base,
          kind: 'review_overdue',
          params: { reference: 'INC-2026-0152', entity: 'SUB-A', employees: 1, days: 2 },
          actionNeeded: true,
        },
        {
          ...base,
          kind: 'return_overdue',
          params: { reference: 'INC-2026-0152', employees: 2, days: 3 },
        },
        {
          ...base,
          kind: 'deadline_approaching',
          params: { reference: 'INC-2026-0160', employees: 4, deadline: '2026-11-30', days: 2 },
        },
        { ...base, kind: 'deadline_approaching', params: { deadline: '30/11/2026' } },
      ]),
      'en',
      t,
    );
    expect(rows.map((row) => row.message)).toEqual([
      '1 employee from SUB-A has waited more than 2 days for review.',
      '2 returned employees are waiting for your update for more than 3 days.',
      'Draft with 4 employees not submitted yet. Deadline: 30 Nov 2026.',
      'Draft with 0 employees not submitted yet. Deadline: .',
    ]);
  });

  it('word the question and answer, and point at the employee', () => {
    const LINE = '22222222-2222-4222-8222-222222222221';
    const [asked, answered, broken] = notificationRows(
      page([
        {
          ...base,
          kind: 'question_asked',
          params: { reference: 'INC-2026-0152', employee: 'Aisha Rahman', lineId: LINE },
          actionNeeded: true,
        },
        {
          ...base,
          kind: 'question_answered',
          params: {
            reference: 'INC-2026-0152',
            employee: 'Aisha Rahman',
            lineId: LINE,
            entity: 'SUB-A',
            actor: 'Alpha HR',
          },
          actionNeeded: true,
        },
        { ...base, kind: 'question_asked', params: { lineId: '../x' } },
      ]),
      'en',
      t,
    );
    expect(asked).toMatchObject({
      message: 'Sirius HR asked a question about Aisha Rahman.',
      lineId: LINE,
      action: 'Respond',
    });
    expect(answered?.message).toBe('SUB-A answered about Aisha Rahman (Alpha HR).');
    expect(broken?.lineId).toBeNull();
  });
});
