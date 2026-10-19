'use server';

import { NotificationFilterSchema } from '@peopleforge/contracts';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { markNotificationsRead } from '@/server/notifications';
import { refreshPortalShell } from '@/server/portal-shell';
import { conversationHref } from '@/lib/conversation-view';
import { requestHref } from '@/lib/routes';
import { flagHref, GROUP_UPLOAD_PATH, uploadHref } from '@/lib/group-view';

/** A group data target, rebuilt from validated parts (bound arguments can be altered). */
function groupHref(target: string): string {
  if (target === 'upload-page') return GROUP_UPLOAD_PATH;
  const [kind, id] = target.split(':');
  const valid = Id.safeParse(id);
  if (!valid.success) return '/notifications';
  return kind === 'flag'
    ? flagHref(valid.data)
    : kind === 'upload'
      ? uploadHref(valid.data)
      : '/notifications';
}

/**
 * Server Actions for the notifications page (R1-07). POST-only with an Origin check (CSRF);
 * the API marks only the caller's own notifications.
 */

const Id = z.uuid();

function filterOf(formData: FormData): string {
  const filter = NotificationFilterSchema.safeParse(formData.get('filter'));
  return filter.success && filter.data !== 'all' ? `?filter=${filter.data}` : '';
}

/** "Mark all as Read". */
export async function markAllReadAction(formData: FormData): Promise<never> {
  const result = await markNotificationsRead();
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  refreshPortalShell();
  redirect(`/notifications${filterOf(formData)}`);
}

/**
 * "View" or "Respond" on a notification: marks it read, then opens its request, or the
 * employee's conversation for a question. The IDs are bound to the action (`.bind`), so nothing
 * about the target comes from the form.
 */
export async function openNotificationAction(
  notificationId: string,
  requestId: string | null,
  lineId: string | null = null,
  groupTarget: string | null = null,
): Promise<never> {
  const result = await markNotificationsRead([Id.parse(notificationId)]);
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  refreshPortalShell();
  if (groupTarget !== null) redirect(groupHref(groupTarget));
  if (requestId === null) redirect('/notifications');
  redirect(
    lineId === null
      ? requestHref(Id.parse(requestId))
      : conversationHref(Id.parse(requestId), Id.parse(lineId)),
  );
}
