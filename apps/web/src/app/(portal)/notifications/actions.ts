'use server';

import { NotificationFilterSchema } from '@peopleforge/contracts';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { markNotificationsRead } from '@/server/notifications';
import { refreshPortalShell } from '@/server/portal-shell';
import { requestHref } from '@/lib/routes';

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
 * "View" on a notification: marks it read, then opens its request. Both IDs are bound to the
 * action (`.bind`), so nothing about the target comes from the form.
 */
export async function openNotificationAction(
  notificationId: string,
  requestId: string | null,
): Promise<never> {
  const result = await markNotificationsRead([Id.parse(notificationId)]);
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  refreshPortalShell();
  redirect(requestId === null ? '/notifications' : requestHref(Id.parse(requestId)));
}
