import { cn } from '@peopleforge/ui';

/**
 * Small, server-rendered charts for the group dashboards (DASH-D5, D6, D8). SVG with attributes
 * only (the production CSP allows no inline styles), one hue per chart (identity is in the
 * labels, never colour alone), values written out beside each mark, a native tooltip per mark,
 * and the same data as a visually hidden table for screen readers. Charts never mirror in RTL.
 */

export interface ChartPoint {
  id: string;
  label: string;
  /** null: no data for this point (a gap, not zero). */
  value: number | null;
  /** The value as people read it ("1,204", "AED 1.2M"). */
  display: string;
}

interface ChartProps {
  /** The chart's name: the hidden table's caption and the figure's label. */
  label: string;
  points: readonly ChartPoint[];
  /** Column headings of the hidden table. */
  columns: { label: string; value: string };
  className?: string;
}

/** Fraction of the largest value, at least a sliver for non-zero values. */
function share(value: number, largest: number): number {
  if (value <= 0 || largest <= 0) return 0;
  return Math.max(2, (value / largest) * 100);
}

function DataTable({ label, points, columns }: ChartProps) {
  return (
    <table className="sr-only">
      <caption>{label}</caption>
      <thead>
        <tr>
          <th scope="col">{columns.label}</th>
          <th scope="col">{columns.value}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.id}>
            <th scope="row">{point.label}</th>
            <td>{point.display}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Horizontal bars, label · bar · value: comparisons across categories. */
export function BarList(props: ChartProps) {
  const { label, points, className } = props;
  const largest = Math.max(0, ...points.map((point) => point.value ?? 0));
  return (
    <figure aria-label={label} className={cn('flex flex-col gap-2.5', className)} dir="ltr">
      <div aria-hidden="true" className="flex flex-col gap-2.5">
        {points.map((point) => (
          <div
            key={point.id}
            className="grid grid-cols-[minmax(4.5rem,8rem)_minmax(0,1fr)_minmax(3.5rem,auto)] items-center gap-3"
          >
            <span className="truncate text-xs text-ink-muted" title={point.label}>
              {point.label}
            </span>
            {/* Stretched to the row: rounded by clipping, as an rx would become an ellipse. */}
            <svg
              viewBox="0 0 100 8"
              preserveAspectRatio="none"
              className="h-2.5 w-full overflow-hidden rounded-full"
            >
              <rect x={0} y={0} width={100} height={8} className="fill-surface-muted" />
              <rect
                x={0}
                y={0}
                width={share(point.value ?? 0, largest)}
                height={8}
                className="fill-brand-500"
              >
                <title>{`${point.label}: ${point.display}`}</title>
              </rect>
            </svg>
            <span className="text-end text-xs font-semibold text-ink tabular-nums">
              {point.display}
            </span>
          </div>
        ))}
      </div>
      <DataTable {...props} />
    </figure>
  );
}

/** Vertical columns over time or ordered categories, with a label under each. */
export function ColumnChart(props: ChartProps & { emptyLabel: string }) {
  const { label, points, className, emptyLabel } = props;
  const largest = Math.max(0, ...points.map((point) => point.value ?? 0));
  const width = 100 / Math.max(1, points.length);
  return (
    <figure aria-label={label} className={cn('flex flex-col gap-2', className)} dir="ltr">
      <div aria-hidden="true">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full">
          <line x1={0} y1={39.75} x2={100} y2={39.75} strokeWidth={0.5} className="stroke-line" />
          {points.map((point, index) => {
            const height = point.value === null ? 0 : (share(point.value, largest) / 100) * 36;
            return (
              <rect
                key={point.id}
                x={index * width + width * 0.18}
                y={39.5 - height}
                width={width * 0.64}
                height={height}
                rx={0.8}
                className="fill-brand-500"
              >
                <title>{`${point.label}: ${point.value === null ? emptyLabel : point.display}`}</title>
              </rect>
            );
          })}
        </svg>
        <ol className="flex">
          {points.map((point) => (
            <li key={point.id} className="min-w-0 flex-1 text-center">
              <span className="block truncate text-[10px] font-semibold text-ink tabular-nums">
                {point.value === null ? '–' : point.display}
              </span>
              <span className="block truncate text-[10px] text-ink-muted">{point.label}</span>
            </li>
          ))}
        </ol>
      </div>
      <DataTable {...props} />
    </figure>
  );
}

export interface RangeRow {
  id: string;
  label: string;
  /** Band minimum and maximum, or null without a band. */
  band: { min: number; max: number } | null;
  value: number;
  display: string;
  bandDisplay: string;
}

/**
 * Average salary per grade against the grade's band: the band as a light range, the average as
 * a dark marker. One scale per chart (one currency).
 */
export function RangeChart({
  label,
  rows,
  columns,
}: {
  label: string;
  rows: readonly RangeRow[];
  columns: { label: string; value: string; band: string };
}) {
  const largest = Math.max(1, ...rows.map((row) => Math.max(row.value, row.band?.max ?? 0)));
  const at = (value: number) => (value / largest) * 100;
  return (
    <figure aria-label={label} className="flex flex-col gap-2.5" dir="ltr">
      <div aria-hidden="true" className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(3rem,5rem)_minmax(0,1fr)_minmax(5rem,auto)] items-center gap-3"
          >
            <span className="text-xs text-ink-muted">{row.label}</span>
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 w-full">
              <rect x={0} y={4} width={100} height={2} className="fill-surface-muted" />
              {row.band === null ? null : (
                <rect
                  x={at(row.band.min)}
                  y={1}
                  width={Math.max(0.5, at(row.band.max) - at(row.band.min))}
                  height={8}
                  className="fill-brand-100"
                >
                  <title>{row.bandDisplay}</title>
                </rect>
              )}
              <rect
                x={Math.max(0, at(row.value) - 0.6)}
                y={0}
                width={1.2}
                height={10}
                className="fill-brand-700"
              >
                <title>{`${row.label}: ${row.display}`}</title>
              </rect>
            </svg>
            <span className="text-end text-xs font-semibold text-ink tabular-nums">
              {row.display}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{columns.label}</th>
            <th scope="col">{columns.value}</th>
            <th scope="col">{columns.band}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              <td>{row.display}</td>
              <td>{row.bandDisplay}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
