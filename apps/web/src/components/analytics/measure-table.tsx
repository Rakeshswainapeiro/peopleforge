import { Table, TBody, Td, Th, THead, Tr } from '@peopleforge/ui';
import type { TableView } from '@/lib/analytics-view';

/** A table of measures (DASH-D3, DASH-D4): the first column names the row, numbers align. */
export function MeasureTable({ table }: { table: TableView }) {
  return (
    <Table caption={table.caption}>
      <THead>
        <tr>
          {table.headers.map((header) => (
            <Th key={header}>{header}</Th>
          ))}
        </tr>
      </THead>
      <TBody>
        {table.rows.map((row) => (
          <Tr key={row.id}>
            {row.cells.map((cell, index) => (
              <Td
                // Columns are fixed per table, so the position names the cell.
                key={`${row.id}:${String(index)}`}
                className={
                  index === 0
                    ? 'font-medium whitespace-nowrap text-ink'
                    : 'tabular-nums whitespace-nowrap'
                }
              >
                {cell}
              </Td>
            ))}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
