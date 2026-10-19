import {
  FlagStatusSchema,
  PeriodSchema as Period,
  RequestStatusSchema,
  type Notification,
  type NotificationFilter,
  type NotificationPage,
} from '@peopleforge/contracts';
import { z } from 'zod';
import { statusBadge } from './request-status';
import type { BadgeTone } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import type { MessageKey, Translate } from '@/i18n/translator';
import { formatDate, formatDateTime } from './format';
import { formatPeriod } from './group-view';
import { pluralForm } from '@peopleforge/i18n';

const LineId = z.uuid();
const Day = z.iso.date();

/** One row of the notifications list (Figma "Notifications"), worded for the reader. */
export interface NotificationRowView {
  id: string;
  requestId: string | null;
  /** The employee it is about, for questions (their conversation); null otherwise. */
  lineId: string | null;
  tag: { tone: BadgeTone; label: string };
  reference: string;
  message: string;
  meta: string;
  unread: boolean;
  /** "Respond" when the reader has to act, else "View". */
  action: string;
  /** Group data (R2): "flag:<id>", "upload:<id>" or "upload-page"; null for requests. */
  groupTarget: string | null;
}

/** Where a group data notification leads: its flag, its upload, or the upload page. */
export function groupTargetOf(notification: Pick<Notification, 'kind' | 'params'>): string | null {
  const flagId = LineId.safeParse(notification.params.flagId);
  if (flagId.success) return `flag:${flagId.data}`;
  const uploadId = LineId.safeParse(notification.params.uploadId);
  if (uploadId.success) return `upload:${uploadId.data}`;
  return notification.kind === 'upload_due' ? 'upload-page' : null;
}

function text(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** The sentence for a notification, in the reader's language, from its kind and values. */
function messageOf(notification: Notification, locale: Locale, t: Translate): string {
  const { params } = notification;
  const number = new Intl.NumberFormat(locale);
  // Employees for requests; flags for group data.
  const count = Number(params.employees ?? params.count ?? params.flags ?? 0);
  const criterion = Number(params.criterion ?? 0);
  const status = RequestStatusSchema.safeParse(params.status);
  const values = {
    count: number.format(count),
    entity: text(params.entity),
    actor: text(params.actor),
    employee: text(params.employee),
    criterion: number.format(criterion),
    // The criterion verified for everyone just before this one.
    done: number.format(Math.max(criterion - 1, 0)),
    of: number.format(Number(params.of ?? 0)),
    status: status.success ? statusBadge(status.data, t).label : '',
    days: number.format(Number(params.days ?? 0)),
    reference: text(params.reference),
    flag: text(params.flag),
    version: number.format(Number(params.version ?? 0)),
    period: Period.safeParse(params.period).success
      ? formatPeriod(String(params.period), locale)
      : '',
    flagStatus: FlagStatusSchema.safeParse(params.flagStatus).success
      ? t(`group.flagStatus.${FlagStatusSchema.parse(params.flagStatus)}`)
      : '',
    deadline: Day.safeParse(params.deadline).success
      ? formatDate(`${String(params.deadline)}T12:00:00Z`, locale)
      : '',
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
    lineId: LineId.safeParse(notification.params.lineId).data ?? null,
    tag: notification.actionNeeded
      ? { tone: 'warning', label: t('notifications.tags.actionNeeded') }
      : { tone: 'info', label: t('notifications.tags.status') },
    reference: text(notification.params.reference),
    message: messageOf(notification, locale, t),
    meta: formatDateTime(notification.createdAt, locale),
    unread: !notification.read,
    action: notification.actionNeeded ? t('notifications.respond') : t('notifications.view'),
    groupTarget: groupTargetOf(notification),
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
