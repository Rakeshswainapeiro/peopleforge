import { Badge, ButtonLink, CellStack, Table, TBody, Td, Th, THead, Tr } from '@peopleforge/ui';
import Link from 'next/link';
import type { ThreadRowView } from '@/lib/conversation-view';

export interface ConversationTableLabels {
  caption: string;
  employee: string;
  request: string;
  last: string;
  when: string;
  messages: string;
  action: string;
  awaiting: string;
}

/**
 * Figma "Conversations" (R1-08): one row per employee with questions, the latest message and
 * who wrote it; threads waiting for the reader are marked and offer Respond.
 */
export function ConversationTable({
  rows,
  labels,
}: {
  rows: readonly ThreadRowView[];
  labels: ConversationTableLabels;
}) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.employee}</Th>
          <Th>{labels.request}</Th>
          <Th>{labels.last}</Th>
          <Th>{labels.when}</Th>
          <Th>{labels.messages}</Th>
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
              <CellStack primary={row.request} secondary={row.entityCode} />
            </Td>
            <Td className="max-w-md">
              <p className="text-xs font-semibold text-ink">{row.by}</p>
              <p className="mt-0.5 truncate text-sm text-ink-muted">{row.preview}</p>
              {row.awaitingMe ? (
                <span className="mt-1 inline-block">
                  <Badge tone="warning" icon="alert">
                    {labels.awaiting}
                  </Badge>
                </span>
              ) : null}
            </Td>
            <Td className="whitespace-nowrap">{row.when}</Td>
            <Td className="tabular-nums">{row.messages}</Td>
            <Td className="text-end">
              <ButtonLink
                href={row.href}
                variant={row.awaitingMe ? 'primary' : 'outline'}
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
