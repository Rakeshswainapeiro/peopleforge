import { Badge, StageMeter, Table, TBody, Td, Th, THead, Tr } from '@peopleforge/ui';
import Link from 'next/link';
import type { RequestRowView } from '@/lib/dashboard-view';

export interface RequestsTableLabels {
  caption: string;
  request: string;
  subsidiary: string;
  created: string;
  employees: string;
  stage: string;
  status: string;
  age: string;
  with: string;
  view: string;
}

export interface RequestsTableProps {
  rows: readonly RequestRowView[];
  /** Sirius HR sees every subsidiary: add a Subsidiary column. */
  showSubsidiary: boolean;
  labels: RequestsTableLabels;
}

/** Figma "By request": one row per request with its stage, status and age (R1-10). */
export function RequestsTable({ rows, showSubsidiary, labels }: RequestsTableProps) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.request}</Th>
          {showSubsidiary ? <Th>{labels.subsidiary}</Th> : null}
          <Th>{labels.created}</Th>
          <Th>{labels.employees}</Th>
          <Th>{labels.stage}</Th>
          <Th>{labels.status}</Th>
          <Th>{labels.age}</Th>
          <Th>{labels.with}</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <Link
                href={row.href}
                className="font-semibold whitespace-nowrap text-brand-600 underline-offset-2 transition-colors hover:text-brand-700 hover:underline"
              >
                {row.reference}
              </Link>
            </Td>
            {showSubsidiary ? <Td className="whitespace-nowrap">{row.entityCode}</Td> : null}
            <Td className="whitespace-nowrap">{row.created}</Td>
            <Td>
              <span className="inline-flex items-center gap-2 tabular-nums">
                {row.employees}
                <Link
                  href={row.employeesHref}
                  aria-label={row.employeesLabel}
                  className="rounded-control border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors hover:border-brand-500 hover:text-brand-600"
                >
                  {labels.view}
                </Link>
              </span>
            </Td>
            <Td>
              <StageMeter {...row.stage} />
            </Td>
            <Td>
              <Badge tone={row.status.tone}>{row.status.label}</Badge>
            </Td>
            <Td className="whitespace-nowrap tabular-nums">{row.age}</Td>
            <Td className="whitespace-nowrap">{row.with}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
