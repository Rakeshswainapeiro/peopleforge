import type { Notification, NotificationFilter, NotificationPage } from '@peopleforge/contracts';
import type { BadgeTone } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import type { MessageKey, Translate } from '@/i18n/translator';
import { formatDateTime } from './format';
import { pluralForm } from './plural';

/** One row of the notifications list (Figma "Notifications"), worded for the reader. */
export interface NotificationRowView {
  id: string;
  requestId: string | null;
  tag: { tone: BadgeTone; label: string };
  reference: string;
  message: string;
  meta: string;
  unread: boolean;
}

function text(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** The sentence for a notification, in the reader's language, from its kind and values. */
function messageOf(notification: Notification, locale: Locale, t: Translate): string {
  const count = Number(notification.params.employees ?? 0);
  const values = {
    count: new Intl.NumberFormat(locale).format(count),
    entity: text(notification.params.entity),
    actor: text(notification.params.actor),
  };
  const key: MessageKey = `notifications.kinds.${notification.kind}.${pluralForm(count, locale)}`;
  return t(key, values);
}

export function notificationRows(
  page: NotificationPage,
  locale: Locale,
  t: Translate,
): NotificationRowView[] {
  return page.items.map((notification) => ({
    id: notification.id,
    requestId: notification.requestId,
    tag: notification.actionNeeded
      ? { tone: 'warning', label: t('notifications.tags.actionNeeded') }
      : { tone: 'info', label: t('notifications.tags.status') },
    reference: text(notification.params.reference),
    message: messageOf(notification, locale, t),
    meta: formatDateTime(notification.createdAt, locale),
    unread: !notification.read,
  }));
}

export const NOTIFICATION_FILTERS: readonly NotificationFilter[] = [
  'all',
  'unread',
  'action_needed',
];

/** "/notifications", "/notifications?filter=unread&page=2". */
export function notificationsHref(filter: NotificationFilter, page = 1): string {
  const query = new URLSearchParams();
  if (filter !== 'all') query.set('filter', filter);
  if (page > 1) query.set('page', String(page));
  const search = query.toString();
  return search === '' ? '/notifications' : `/notifications?${search}`;
}
