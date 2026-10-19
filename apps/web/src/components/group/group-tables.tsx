import { Badge, type BadgeTone, CellStack, Table, TBody, Td, Th, THead, Tr } from '@peopleforge/ui';
import Link from 'next/link';

/** Group data tables: plain data in, so pages build the rows and these only lay them out. */

const linkClass = 'font-semibold text-brand-600 underline-offset-2 hover:underline';

interface BadgeView {
  tone: BadgeTone;
  label: string;
}

export interface UploadsTableProps {
  rows: readonly {
    id: string;
    reference: string;
    entity: string;
    period: string;
    version: string;
    badge: BadgeView;
    rows: string;
    problems: string;
    flags: string;
    by: string;
    href: string;
  }[];
  labels: {
    caption: string;
    upload: string;
    month: string;
    status: string;
    rows: string;
    problems: string;
    flags: string;
  };
}

export function UploadsTable({ rows, labels }: UploadsTableProps) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.upload}</Th>
          <Th>{labels.month}</Th>
          <Th>{labels.status}</Th>
          <Th align="end">{labels.rows}</Th>
          <Th>{labels.problems}</Th>
          <Th align="end">{labels.flags}</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <CellStack
                primary={
                  <Link href={row.href} className={linkClass}>
                    {row.reference}
                  </Link>
                }
                secondary={row.by}
              />
            </Td>
            <Td>
              <CellStack primary={row.entity} secondary={`${row.period} · ${row.version}`} />
            </Td>
            <Td>
              <Badge tone={row.badge.tone}>{row.badge.label}</Badge>
            </Td>
            <Td className="text-end tabular-nums">{row.rows}</Td>
            <Td>{row.problems}</Td>
            <Td className="text-end tabular-nums">{row.flags}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export interface IssuesTableProps {
  rows: readonly { where: string; column: string; problem: string; severity: BadgeView }[];
  labels: { caption: string; where: string; column: string; severity: string; problem: string };
}

export function IssuesTable({ rows, labels }: IssuesTableProps) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.where}</Th>
          <Th>{labels.column}</Th>
          <Th>{labels.severity}</Th>
          <Th>{labels.problem}</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <Tr key={index}>
            <Td className="whitespace-nowrap">{row.where}</Td>
            <Td>{row.column}</Td>
            <Td>
              <Badge tone={row.severity.tone}>{row.severity.label}</Badge>
            </Td>
            <Td>{row.problem}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export interface EmployeesTableProps {
  rows: readonly {
    id: string;
    name: string;
    number: string;
    entity: string;
    department: string;
    grade: string;
    salary: string;
    status: string;
    version: string;
    href: string;
  }[];
  labels: {
    caption: string;
    employee: string;
    subsidiary: string;
    department: string;
    grade: string;
    salary: string;
    status: string;
    version: string;
  };
}

export function EmployeesTable({ rows, labels }: EmployeesTableProps) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.employee}</Th>
          <Th>{labels.subsidiary}</Th>
          <Th>{labels.department}</Th>
          <Th>{labels.grade}</Th>
          <Th align="end">{labels.salary}</Th>
          <Th>{labels.status}</Th>
          <Th>{labels.version}</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <CellStack
                primary={
                  <Link href={row.href} className={linkClass}>
                    {row.name}
                  </Link>
                }
                secondary={row.number}
              />
            </Td>
            <Td>{row.entity}</Td>
            <Td>{row.department}</Td>
            <Td>{row.grade}</Td>
            <Td className="text-end tabular-nums">{row.salary}</Td>
            <Td>{row.status}</Td>
            <Td>{row.version}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export interface FlagsTableProps {
  rows: readonly {
    id: string;
    reference: string;
    rule: string;
    subject: string;
    entity: string;
    owner: string;
    badge: BadgeView;
    age: string;
    href: string;
  }[];
  labels: {
    caption: string;
    flag: string;
    subject: string;
    subsidiary: string;
    owner: string;
    status: string;
    raised: string;
  };
}

export function FlagsTable({ rows, labels }: FlagsTableProps) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.flag}</Th>
          <Th>{labels.subject}</Th>
          <Th>{labels.subsidiary}</Th>
          <Th>{labels.owner}</Th>
          <Th>{labels.status}</Th>
          <Th>{labels.raised}</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <CellStack
                primary={
                  <Link href={row.href} className={linkClass}>
                    {row.reference}
                  </Link>
                }
                secondary={row.rule}
              />
            </Td>
            <Td>{row.subject}</Td>
            <Td>{row.entity}</Td>
            <Td>{row.owner}</Td>
            <Td>
              <Badge tone={row.badge.tone}>{row.badge.label}</Badge>
            </Td>
            <Td className="whitespace-nowrap">{row.age}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export interface EntityBarsProps {
  rows: readonly {
    entity: string;
    total: number;
    parts: readonly { id: string; label: string; count: number; className: string }[];
    text: string;
  }[];
  label: string;
}

/**
 * Figma "Flags by subsidiary": one stacked bar per subsidiary (open, in progress, resolved). The
 * numbers are also written out, so the colours never carry the meaning alone. Drawn as SVG with
 * attributes (no inline styles: the production CSP allows none).
 */
export function EntityBars({ rows, label }: EntityBarsProps) {
  const widest = Math.max(1, ...rows.map((row) => row.total));
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((row) => {
        let start = 0;
        return (
          <li key={row.entity} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
            <span className="text-sm font-medium text-ink">{row.entity}</span>
            <div className="flex flex-col gap-1">
              <svg
                viewBox="0 0 100 4"
                preserveAspectRatio="none"
                className="h-3 w-full overflow-hidden rounded-full bg-surface-muted"
                aria-hidden="true"
              >
                {row.parts.map((part) => {
                  const width = (part.count / widest) * 100;
                  const x = start;
                  start += width;
                  return part.count === 0 ? null : (
                    <rect
                      key={part.id}
                      x={x}
                      y={0}
                      width={width}
                      height={4}
                      className={part.className}
                    />
                  );
                })}
              </svg>
              <span className="text-xs text-ink-muted">{row.text}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface ChangeListProps {
  changes: readonly { field: string; before: string; after: string }[];
  labels: { caption: string; field: string; before: string; after: string };
}

export function ChangeList({ changes, labels }: ChangeListProps) {
  return (
    <Table caption={labels.caption}>
      <THead>
        <tr>
          <Th>{labels.field}</Th>
          <Th>{labels.before}</Th>
          <Th>{labels.after}</Th>
        </tr>
      </THead>
      <TBody>
        {changes.map((change) => (
          <Tr key={change.field}>
            <Td>{change.field}</Td>
            <Td className="text-ink-muted line-through decoration-ink-subtle">{change.before}</Td>
            <Td className="font-medium">{change.after}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
