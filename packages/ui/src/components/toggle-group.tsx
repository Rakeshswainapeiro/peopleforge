import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { focusRing, transition } from '../lib/focus.js';
import { PlainLink, type LinkComponent } from '../lib/link.js';

export interface ToggleItem {
  href: string;
  label: ReactNode;
  /** Optional count after the label (Figma: "By request 7", "Unread (2)"). */
  count?: number;
  active: boolean;
}

export interface ToggleGroupProps {
  /** Accessible name of the group, e.g. "View" or "Filter notifications". */
  label: string;
  items: readonly ToggleItem[];
  /** `segmented`: joined tabs (By request / By employee). `pills`: separate chips (All / Unread). */
  variant?: 'segmented' | 'pills';
  as?: LinkComponent;
}

/**
 * View and filter switches as links, so the choice lives in the URL (shareable, back button,
 * works without JavaScript). The current one is marked aria-current.
 */
export function ToggleGroup({
  label,
  items,
  variant = 'segmented',
  as: LinkAs = PlainLink,
}: ToggleGroupProps) {
  const segmented = variant === 'segmented';
  return (
    <nav aria-label={label}>
      <ul
        className={cn(
          'inline-flex flex-wrap',
          segmented ? 'rounded-control border border-line-strong bg-surface p-0.5' : 'gap-2',
        )}
      >
        {items.map((item) => (
          <li key={item.href}>
            <LinkAs
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-1 px-3 text-xs font-medium',
                segmented ? 'rounded-[calc(var(--radius-control)-2px)]' : 'rounded-full border',
                item.active
                  ? 'border-ink bg-ink text-white'
                  : segmented
                    ? 'text-ink hover:bg-surface-muted'
                    : 'border-line-strong bg-surface text-ink hover:border-ink-subtle hover:bg-surface-muted',
                transition,
                focusRing,
              )}
            >
              {item.label}
              {item.count === undefined ? null : (
                <>
                  {' '}
                  <span className="tabular-nums">{item.count}</span>
                </>
              )}
            </LinkAs>
          </li>
        ))}
      </ul>
    </nav>
  );
}
