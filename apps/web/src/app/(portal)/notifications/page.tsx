import { guardedPlaceholder } from '@/server/guarded-page';

/** Notifications (R1-07, R1-13): built with the workflow slices. */
export default function NotificationsPage() {
  return guardedPlaceholder(undefined, 'notifications.heading', 'notifications.intro');
}
