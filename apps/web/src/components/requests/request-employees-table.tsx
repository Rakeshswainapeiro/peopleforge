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
import type { DetailRowView } from '@/lib/request-detail-view';

export interface RequestEmployeesTableLabels {
  caption: string;
  employee: string;
  grade: string;
  current: string;
  proposed: string;
  criteria: string;
  status: string;
  action: string;
  viewStatus: string;
  stateLabels: Readonly<Record<CriterionState, string>>;
}

export interface RequestEmployeesTableProps {
  rows: readonly DetailRowView[];
  labels: RequestEmployeesTableLabels;
}

/**
 * Figma request detail "Employees": salary, proposal (percentage and amount), criteria marks and
 * status per employee, each opening its status page.
 */
export function RequestEmployeesTable({ rows, labels }: RequestEmployeesTableProps) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.employee}</Th>
          <Th>{labels.grade}</Th>
          <Th>{labels.current}</Th>
          <Th>{labels.proposed}</Th>
          <Th>{labels.criteria}</Th>
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
              <CellStack primary={row.name} secondary={row.number} />
            </Td>
            <Td className="whitespace-nowrap">{row.grade}</Td>
            <Td className="whitespace-nowrap tabular-nums">{row.current}</Td>
            <Td className="whitespace-nowrap tabular-nums">
              <CellStack primary={row.percent} secondary={row.increase ?? undefined} />
            </Td>
            <Td>
              <CriteriaProgress
                variant="marks"
                results={row.marks}
                label={row.marksLabel}
                stateLabels={labels.stateLabels}
              />
            </Td>
            <Td>
              <Badge tone={row.status.tone}>{row.status.label}</Badge>
            </Td>
            <Td className="text-end">
              <ButtonLink
                href={row.href}
                variant="outline"
                size="sm"
                as={Link}
                aria-label={row.viewLabel}
              >
                {labels.viewStatus}
              </ButtonLink>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
