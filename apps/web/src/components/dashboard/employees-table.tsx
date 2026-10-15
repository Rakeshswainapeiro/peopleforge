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
import type { LineRowView } from '@/lib/dashboard-view';

export interface EmployeesTableLabels {
  caption: string;
  employee: string;
  subsidiary: string;
  proposed: string;
  criteria: string;
  status: string;
  updated: string;
  action: string;
  viewStatus: string;
  stateLabels: Readonly<Record<CriterionState, string>>;
}

export interface EmployeesTableProps {
  rows: readonly LineRowView[];
  showSubsidiary: boolean;
  labels: EmployeesTableLabels;
}

/**
 * Figma "By employee": each employee's proposal, criteria marks and status, with View Status.
 * No salaries here; the status page shows the money (data minimisation).
 */
export function EmployeesTable({ rows, showSubsidiary, labels }: EmployeesTableProps) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.employee}</Th>
          {showSubsidiary ? <Th>{labels.subsidiary}</Th> : null}
          <Th>{labels.proposed}</Th>
          <Th>{labels.criteria}</Th>
          <Th>{labels.status}</Th>
          <Th>{labels.updated}</Th>
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
            {showSubsidiary ? <Td className="whitespace-nowrap">{row.entityCode}</Td> : null}
            <Td className="whitespace-nowrap tabular-nums">{row.proposed}</Td>
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
            <Td className="whitespace-nowrap">{row.updated}</Td>
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
