import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon.js';
import { cn } from '../lib/cn.js';
import { focusRing, transition } from '../lib/focus.js';
import { PlainLink, type LinkComponent } from '../lib/link.js';

export interface PaginationLabels {
  /** Name of the navigation landmark, e.g. "Pagination". */
  navigation: string;
  /** Visible text, already formatted, e.g. "Page 1 of 4". */
  pageOf: string;
  first: string;
  previous: string;
  next: string;
  last: string;
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  /** Builds the URL for a page number (1-based). */
  hrefFor: (page: number) => string;
  labels: PaginationLabels;
  /** Optional control before the page text (Figma: "Rows per page" select). */
  pageSize?: ReactNode;
  as?: LinkComponent;
}

function PageLink({
  target,
  enabled,
  icon,
  label,
  hrefFor,
  LinkAs,
}: {
  target: number;
  enabled: boolean;
  icon: IconName;
  label: string;
  hrefFor: (page: number) => string;
  LinkAs: LinkComponent;
}) {
  const classes = cn(
    'inline-flex size-8 items-center justify-center rounded-control border border-line-strong bg-surface text-ink',
    transition,
    focusRing,
  );
  if (!enabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        role="link"
        className={cn(classes, 'opacity-40')}
      >
        <Icon name={icon} />
      </span>
    );
  }
  return (
    <LinkAs
      href={hrefFor(target)}
      aria-label={label}
      className={cn(classes, 'hover:bg-surface-muted')}
    >
      <Icon name={icon} />
    </LinkAs>
  );
}

/** URL-driven pagination (Figma table footer). Page numbers are clamped to 1…pageCount. */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  labels,
  pageSize,
  as: LinkAs = PlainLink,
}: PaginationProps) {
  const last = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), last);
  const common = { hrefFor, LinkAs };
  return (
    <nav
      aria-label={labels.navigation}
      className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 pt-4"
    >
      {pageSize}
      <p className="text-xs font-medium text-ink" aria-live="polite">
        {labels.pageOf}
      </p>
      <div className="flex items-center gap-1.5">
        <PageLink
          {...common}
          target={1}
          enabled={current > 1}
          icon="chevrons-start"
          label={labels.first}
        />
        <PageLink
          {...common}
          target={current - 1}
          enabled={current > 1}
          icon="chevron-start"
          label={labels.previous}
        />
        <PageLink
          {...common}
          target={current + 1}
          enabled={current < last}
          icon="chevron-end"
          label={labels.next}
        />
        <PageLink
          {...common}
          target={last}
          enabled={current < last}
          icon="chevrons-end"
          label={labels.last}
        />
      </div>
    </nav>
  );
}
