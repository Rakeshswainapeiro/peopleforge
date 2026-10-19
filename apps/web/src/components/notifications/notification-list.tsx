import { Badge, Button, cn } from '@peopleforge/ui';
import { openNotificationAction } from '@/app/(portal)/notifications/actions';
import type { NotificationRowView } from '@/lib/notification-view';

export interface NotificationListProps {
  rows: readonly NotificationRowView[];
  label: string;
  unreadLabel: string;
}

/**
 * Figma "Notifications" list: tag, reference, message and time, with "View" or "Respond" (which marks the
 * notification read and opens its request). The whole row is the click target (View's hit area
 * is stretched over it), so nobody has to aim for the button. Unread rows are shaded, bold and
 * carry a dot (shape as well as colour).
 */
export function NotificationList({ rows, label, unreadLabel }: NotificationListProps) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line">
      {rows.map((row) => (
        <li
          key={row.id}
          data-unread={row.unread}
          className={cn(
            'relative flex flex-wrap items-center justify-between gap-4 px-4 py-3.5',
            'transition-colors duration-150 ease-[var(--ease-standard)] hover:bg-brand-50/60',
            'has-[button:focus-visible]:bg-brand-50/60',
            row.unread && 'bg-surface-muted',
          )}
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              {row.unread ? (
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand-600" />
              ) : null}
              <Badge tone={row.tag.tone}>{row.tag.label}</Badge>
              <span className="text-xs font-semibold text-ink">{row.reference}</span>
              {row.unread ? <span className="sr-only">{unreadLabel}</span> : null}
            </p>
            <p className={cn('mt-1.5 text-xs text-ink', row.unread && 'font-semibold')}>
              {row.message}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">{row.meta}</p>
          </div>
          <form
            action={openNotificationAction.bind(
              null,
              row.id,
              row.requestId,
              row.lineId,
              row.groupTarget,
            )}
          >
            <Button
              type="submit"
              variant="secondary"
              // The whole row (the positioned <li>) clicks View.
              stretched
            >
              {row.action}
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
