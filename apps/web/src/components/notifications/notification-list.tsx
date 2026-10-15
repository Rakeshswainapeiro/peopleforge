import { Badge, Button, cn } from '@peopleforge/ui';
import { openNotificationAction } from '@/app/(portal)/notifications/actions';
import type { NotificationRowView } from '@/lib/notification-view';

export interface NotificationListProps {
  rows: readonly NotificationRowView[];
  label: string;
  viewLabel: string;
  unreadLabel: string;
}

/**
 * Figma "Notifications" list: tag, reference, message and time, with "View" (which marks the
 * notification read and opens its request). Unread rows are shaded and bold.
 */
export function NotificationList({ rows, label, viewLabel, unreadLabel }: NotificationListProps) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line">
      {rows.map((row) => (
        <li
          key={row.id}
          data-unread={row.unread}
          className={cn(
            'flex flex-wrap items-center justify-between gap-4 px-4 py-3.5',
            row.unread && 'bg-surface-muted',
          )}
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={row.tag.tone}>{row.tag.label}</Badge>
              <span className="text-xs font-semibold text-ink">{row.reference}</span>
              {row.unread ? <span className="sr-only">{unreadLabel}</span> : null}
            </p>
            <p className={cn('mt-1.5 text-xs text-ink', row.unread && 'font-semibold')}>
              {row.message}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">{row.meta}</p>
          </div>
          <form action={openNotificationAction.bind(null, row.id, row.requestId)}>
            <Button type="submit" variant="secondary">
              {viewLabel}
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
