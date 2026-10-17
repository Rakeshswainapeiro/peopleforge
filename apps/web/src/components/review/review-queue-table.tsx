import {
  Badge,
  ButtonLink,
  CellStack,
  CriteriaProgress,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  type CriterionState,
} from '@peopleforge/ui';
import Link from 'next/link';
import type { QueueRowView } from '@/lib/review-view';

export interface ReviewQueueTableLabels {
  caption: string;
  employee: string;
  request: string;
  proposed: string;
  submitted: string;
  verified: string;
  waiting: string;
  status: string;
  action: string;
  stateLabels: Readonly<Record<CriterionState, string>>;
}

/**
 * Figma "Review queue" (R1-07): each employee waiting for Sirius HR with their request, what
 * the subsidiary submitted, how much is verified and how long they've waited (past the reminder
 * time in amber, with words). No salaries: the review page shows the money.
 */
export function ReviewQueueTable({
  rows,
  labels,
}: {
  rows: readonly QueueRowView[];
  labels: ReviewQueueTableLabels;
}) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.employee}</Th>
          <Th>{labels.request}</Th>
          <Th>{labels.proposed}</Th>
          <Th>{labels.submitted}</Th>
          <Th>{labels.verified}</Th>
          <Th>{labels.waiting}</Th>
          <Th>{labels.status}</Th>
          <Th>
            <span className="sr-only">{labels.action}</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <CellStack primary={row.name} secondary={row.detail} />
            </Td>
            <Td>
              <CellStack primary={row.request} secondary={`${row.entityCode} · ${row.stage}`} />
            </Td>
            <Td className="whitespace-nowrap tabular-nums">{row.proposed}</Td>
            <Td>
              <CriteriaProgress
                variant="marks"
                results={row.marks}
                label={row.marksLabel}
                stateLabels={labels.stateLabels}
              />
            </Td>
            <Td className="whitespace-nowrap tabular-nums">{row.verified}</Td>
            <Td className="whitespace-nowrap">
              <span className="tabular-nums">{row.waiting}</span>
              {row.overdue === null ? null : (
                <span className="mt-1 block">
                  <Badge tone="warning" icon="alert">
                    {row.overdue}
                  </Badge>
                </span>
              )}
            </Td>
            <Td>
              <Badge tone={row.status.tone}>{row.status.label}</Badge>
            </Td>
            <Td className="text-end">
              <ButtonLink
                href={row.href}
                variant={row.overdue === null ? 'outline' : 'primary'}
                size="sm"
                as={Link}
                aria-label={row.actionLabel}
              >
                {row.action}
              </ButtonLink>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
