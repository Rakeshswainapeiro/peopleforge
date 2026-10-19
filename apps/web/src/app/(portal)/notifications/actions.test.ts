import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markNotificationsRead } from '@/server/notifications';
import { refreshPortalShell } from '@/server/portal-shell';
import { markAllReadAction, openNotificationAction } from './actions';

vi.mock('@/server/notifications', () => ({ markNotificationsRead: vi.fn() }));
vi.mock('@/server/portal-shell', () => ({ refreshPortalShell: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const NOTE = '66666666-6666-4666-8666-666666666661';
const REQUEST = '11111111-1111-4111-8111-111111111111';

function form(filter?: string): FormData {
  const data = new FormData();
  if (filter !== undefined) data.set('filter', filter);
  return data;
}

beforeEach(() => {
  vi.mocked(refreshPortalShell).mockClear();
  vi.mocked(markNotificationsRead).mockResolvedValue({ kind: 'ok', data: null });
});

describe('markAllReadAction', () => {
  it('marks everything read and stays on the current filter', async () => {
    await expect(markAllReadAction(form('unread'))).rejects.toThrow(
      'NEXT_REDIRECT /notifications?filter=unread',
    );
    expect(markNotificationsRead).toHaveBeenCalledWith();
    // The sidebar bell drops its count straight away.
    expect(refreshPortalShell).toHaveBeenCalled();
    await expect(markAllReadAction(form('all'))).rejects.toThrow('NEXT_REDIRECT /notifications');
    await expect(markAllReadAction(form('<script>'))).rejects.toThrow(
      /^NEXT_REDIRECT \/notifications$/u,
    );
  });

  it('ends a session the API no longer accepts', async () => {
    vi.mocked(markNotificationsRead).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(markAllReadAction(form())).rejects.toThrow('NEXT_REDIRECT /session-ended');
    expect(refreshPortalShell).not.toHaveBeenCalled();
  });
});

describe('openNotificationAction', () => {
  it('marks the notification read and opens its request', async () => {
    await expect(openNotificationAction(NOTE, REQUEST)).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}`,
    );
    expect(markNotificationsRead).toHaveBeenCalledWith([NOTE]);
    expect(refreshPortalShell).toHaveBeenCalled();
    await expect(openNotificationAction(NOTE, null)).rejects.toThrow(
      /^NEXT_REDIRECT \/notifications$/u,
    );
  });

  it('opens the employee’s conversation for a question [R1-08]', async () => {
    const LINE = '22222222-2222-4222-8222-222222222221';
    await expect(openNotificationAction(NOTE, REQUEST, LINE)).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/employees/${LINE}#conversation`,
    );
  });

  it('opens a group data flag, upload or the upload page [R2-11]', async () => {
    const FLAG = '88888888-8888-4888-8888-888888888881';
    await expect(openNotificationAction(NOTE, null, null, `flag:${FLAG}`)).rejects.toThrow(
      `NEXT_REDIRECT /group/quality/flags/${FLAG}`,
    );
    await expect(openNotificationAction(NOTE, null, null, `upload:${FLAG}`)).rejects.toThrow(
      `NEXT_REDIRECT /group/uploads/${FLAG}`,
    );
    await expect(openNotificationAction(NOTE, null, null, 'upload-page')).rejects.toThrow(
      'NEXT_REDIRECT /group/upload',
    );
    // Altered targets lead nowhere else.
    await expect(openNotificationAction(NOTE, null, null, 'flag:../../admin')).rejects.toThrow(
      /^NEXT_REDIRECT \/notifications$/u,
    );
    await expect(openNotificationAction(NOTE, null, null, `other:${FLAG}`)).rejects.toThrow(
      /^NEXT_REDIRECT \/notifications$/u,
    );
  });

  it('refuses tampered IDs and ends a dead session', async () => {
    await expect(openNotificationAction('../x', REQUEST)).rejects.toThrow();
    expect(markNotificationsRead).not.toHaveBeenCalled();
    vi.mocked(markNotificationsRead).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(openNotificationAction(NOTE, REQUEST)).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
  });
});
