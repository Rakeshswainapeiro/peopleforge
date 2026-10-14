import { Icon } from '../icons/icon.js';
import { cn } from '../lib/cn.js';

export type CriterionState = 'pass' | 'fail' | 'pending';

export interface CriteriaProgressProps {
  /** One entry per criterion, in display order. */
  results: readonly { code: string; state: CriterionState }[];
  /** Visible summary, e.g. "4/5 complete"; also the accessible description. */
  label: string;
  /** Tooltip text per state, e.g. { pass: 'Pass', fail: 'Fail', pending: 'Not assessed' }. */
  stateLabels: Readonly<Record<CriterionState, string>>;
}

function icon(state: CriterionState) {
  if (state === 'pass') return { name: 'check' as const, box: 'bg-success-50 text-success-600' };
  if (state === 'fail') return { name: 'x' as const, box: 'bg-danger-50 text-danger-600' };
  return { name: 'circle' as const, box: 'bg-surface-muted text-ink-subtle' };
}

/**
 * Figma "Criteria" cell: a mark per criterion (✓ pass, ✗ fail, ○ not yet) and "n/5 complete".
 * Every mark has a shape as well as a colour (R1-06); the text carries the meaning for screen
 * readers, the marks are decorative.
 */
export function CriteriaProgress({ results, label, stateLabels }: CriteriaProgressProps) {
  const complete = results.length > 0 && results.every((result) => result.state !== 'pending');
  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 rounded-control border px-2.5 py-1.5',
        complete ? 'border-brand-100 bg-brand-50' : 'border-line bg-surface',
      )}
    >
      <ul aria-hidden="true" className="flex gap-1">
        {results.map((result) => {
          const mark = icon(result.state);
          return (
            <li
              key={result.code}
              title={`${result.code} · ${stateLabels[result.state]}`}
              className={cn('flex size-5 items-center justify-center rounded-[4px]', mark.box)}
            >
              <Icon name={mark.name} className="size-3" />
            </li>
          );
        })}
      </ul>
      <span className={cn('whitespace-nowrap text-sm', complete ? 'text-brand-600' : 'text-ink')}>
        {label}
      </span>
    </div>
  );
}
