import { Icon, type IconName } from '../icons/icon.js';
import { cn } from '../lib/cn.js';
import { transition } from '../lib/focus.js';
import { PlainLink, type LinkComponent } from '../lib/link.js';

export interface NavItemProps {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  /** A count after the label, e.g. unread notifications; hidden at 0. */
  badge?: number | undefined;
  /** Screen-reader text for the count, e.g. "2 unread". */
  badgeLabel?: string | undefined;
  as?: LinkComponent;
}

/** Sidebar entry. Figma: the current page is a white pill with dark text. */
export function NavItem({
  href,
  label,
  icon,
  active,
  badge,
  badgeLabel,
  as: LinkAs = PlainLink,
}: NavItemProps) {
  return (
    <LinkAs
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        active
          ? 'bg-white text-sidebar shadow-card'
          : 'text-sidebar-ink hover:bg-white/10 hover:text-white',
        transition,
      )}
    >
      <Icon name={icon} />
      {label}
      {badge === undefined || badge === 0 ? null : (
        <span
          className={cn(
            'ms-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-5 tabular-nums',
            active ? 'bg-brand-600 text-white' : 'bg-accent text-sidebar',
          )}
        >
          <span aria-hidden="true">{badge > 99 ? '99+' : badge}</span>
          <span className="sr-only">{`, ${badgeLabel ?? String(badge)}`}</span>
        </span>
      )}
    </LinkAs>
  );
}
