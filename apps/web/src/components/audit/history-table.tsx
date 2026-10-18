import { Table, TBody, Td, Th, THead, Tr } from '@peopleforge/ui';
import type { HistoryRowView } from '@/lib/history-view';

export interface HistoryTableLabels {
  caption: string;
  when: string;
  who: string;
  what: string;
}

/** A request's History (R1-15): when, who and what, newest first. */
export function HistoryTable({
  rows,
  labels,
}: {
  rows: readonly HistoryRowView[];
  labels: HistoryTableLabels;
}) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.when}</Th>
          <Th>{labels.who}</Th>
          <Th>{labels.what}</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td className="whitespace-nowrap tabular-nums">{row.when}</Td>
            <Td className="whitespace-nowrap font-medium text-ink">{row.who}</Td>
            <Td>{row.what}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
