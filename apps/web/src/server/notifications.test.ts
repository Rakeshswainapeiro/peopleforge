import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listNotifications, markNotificationsRead, notificationSummary } from './notifications';
import { callApi } from './session';

vi.mock('./session', () => ({ callApi: vi.fn() }));

beforeEach(() => {
  vi.mocked(callApi).mockResolvedValue({ kind: 'unavailable' });
});

describe('notification client', () => {
  it('calls the documented paths', async () => {
    const ID = '66666666-6666-4666-8666-666666666661';
    await listNotifications('unread', 2);
    await notificationSummary();
    await markNotificationsRead([ID]);
    await markNotificationsRead();
    expect(vi.mocked(callApi).mock.calls.map(([path, , init]) => [path, init])).toEqual([
      ['/api/v1/notifications?filter=unread&page=2&pageSize=20', undefined],
      ['/api/v1/notifications/summary', undefined],
      ['/api/v1/notifications/read', { method: 'POST', body: { ids: [ID] } }],
      ['/api/v1/notifications/read', { method: 'POST', body: {} }],
    ]);
  });
});
