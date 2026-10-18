import { CellStack, Table, TBody, Td, Th, THead, Tr } from '@peopleforge/ui';
import Link from 'next/link';
import type { AuditRowView } from '@/lib/audit-view';

export interface AuditTableLabels {
  caption: string;
  when: string;
  who: string;
  action: string;
  subject: string;
  details: string;
  /** "Show only the actions of {name}" for one row, as its link's accessible name. */
  onlyUser: (name: string) => string;
  onlyUserText: (name: string) => string;
}

/** The audit trail (R1-15): one row per recorded action; a name filters to that person. */
export function AuditTable({
  rows,
  labels,
}: {
  rows: readonly AuditRowView[];
  labels: AuditTableLabels;
}) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.when}</Th>
          <Th>{labels.who}</Th>
          <Th>{labels.action}</Th>
          <Th>{labels.subject}</Th>
          <Th>{labels.details}</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td className="whitespace-nowrap tabular-nums">{row.when}</Td>
            <Td>
              <CellStack primary={row.who} secondary={row.actor} />
              <Link
                href={row.onlyHref}
                aria-label={labels.onlyUser(row.who)}
                className="text-xs font-medium text-brand-600 underline-offset-2 hover:underline"
              >
                {labels.onlyUserText(row.who)}
              </Link>
            </Td>
            <Td className="whitespace-nowrap font-medium text-ink">{row.action}</Td>
            <Td className="max-w-48 truncate text-xs text-ink-muted" title={row.subject}>
              {row.subject}
            </Td>
            <Td className="max-w-sm truncate text-xs text-ink-muted" title={row.details}>
              {row.details}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
