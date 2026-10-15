import { Badge, ButtonLink, CellStack, Table, TBody, Td, Th, THead, Tr } from '@peopleforge/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ActionRowView } from '@/lib/dashboard-view';

export interface NeedsYourActionLabels {
  title: string;
  /** Screen-reader text for the count badge: "9 items need your action". */
  count: string;
  /** "1 draft not submitted. Longest waiting first." */
  summary: string;
  caption: string;
  type: string;
  employee: string;
  needed: string;
  waiting: string;
  overdue: string;
  /** "Showing 4 of 9". */
  showing: string;
  /** "See all drafts". */
  seeAll: string;
}

export interface NeedsYourActionProps {
  total: number;
  rows: readonly ActionRowView[];
  /** The "Show" select (a LinkSelect). */
  show: ReactNode;
  seeAllHref: string;
  labels: NeedsYourActionLabels;
}

/**
 * Figma "Needs your action": everything waiting on the subsidiary, longest waiting first, with
 * what each needs and a button to do it. Drafts now; Sirius HR's questions and returns join it
 * (S5). Waiting turns red past the threshold, with words as well as colour.
 */
export function NeedsYourAction({ total, rows, show, seeAllHref, labels }: NeedsYourActionProps) {
  // One per page.
  const titleId = 'needs-your-action';
  return (
    <section
      aria-labelledby={titleId}
      className="mt-6 animate-enter rounded-card border border-warning-200 bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {/* The count sits beside the heading, not in it: the region is named by the title alone. */}
          <div className="flex items-center gap-2">
            <h2 id={titleId} className="text-sm font-semibold text-warning-700">
              {labels.title}
            </h2>
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-warning-700/90 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">
              <span aria-hidden="true">{total}</span>
              <span className="sr-only">{labels.count}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">{labels.summary}</p>
        </div>
        {show}
      </div>
      <div className="mt-3">
        <Table caption={labels.caption}>
          <THead>
            <tr>
              <Th>{labels.type}</Th>
              <Th>{labels.employee}</Th>
              <Th>{labels.needed}</Th>
              <Th>{labels.waiting}</Th>
              <Th>
                <span className="sr-only">{labels.caption}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <Badge tone={row.type.tone}>{row.type.label}</Badge>
                </Td>
                <Td>
                  <CellStack primary={row.primary} secondary={row.secondary} />
                </Td>
                <Td>
                  <CellStack primary={row.needed} secondary={row.neededDetail} />
                </Td>
                <Td
                  className={
                    row.overdue
                      ? 'font-semibold whitespace-nowrap text-danger-600 tabular-nums'
                      : 'whitespace-nowrap tabular-nums'
                  }
                >
                  {row.waiting}
                  {row.overdue ? <span className="sr-only"> {labels.overdue}</span> : null}
                </Td>
                <Td className="text-end">
                  <ButtonLink href={row.href} variant="outline" size="sm" as={Link}>
                    {row.action}
                  </ButtonLink>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <p className="text-ink-muted">{labels.showing}</p>
        <Link
          href={seeAllHref}
          className="font-semibold text-brand-600 underline-offset-2 transition-colors hover:text-brand-700 hover:underline"
        >
          {labels.seeAll}
        </Link>
      </div>
    </section>
  );
}
