import { Icon, type IconName } from '../icons/icon.js';
import { cn, variantClass } from '../lib/cn.js';

export type MarkState = 'pass' | 'fail' | 'pending' | 'warning';

const BOXES = new Map<MarkState, string>([
  ['pass', 'bg-success-50 text-success-600'],
  ['fail', 'bg-danger-50 text-danger-600'],
  ['pending', 'bg-surface-muted text-ink-subtle'],
  ['warning', 'bg-warning-50 text-warning-700'],
]);

function iconFor(state: MarkState): IconName {
  switch (state) {
    case 'pass':
      return 'check';
    case 'fail':
      return 'x';
    case 'pending':
      return 'circle';
    case 'warning':
      return 'alert';
  }
}

export interface StatusMarkProps {
  state: MarkState;
  /** sm: the criteria cell (20 px). md: criterion cards and the ready list (24 px). */
  size?: 'sm' | 'md';
  /** Tooltip; the mark itself is decorative, so nearby text must carry the meaning (R1-06). */
  title?: string | undefined;
  className?: string;
}

/**
 * Figma status mark: ✓ on green, ✗ on red, ○ on grey, ! on amber, in a small rounded box.
 * A shape as well as a colour, so it never relies on colour alone.
 */
export function StatusMark({ state, size = 'sm', title, className }: StatusMarkProps) {
  return (
    <span
      aria-hidden="true"
      title={title}
      data-state={state}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[4px]',
        size === 'sm' ? 'size-5' : 'size-6',
        variantClass(BOXES, state),
        className,
      )}
    >
      <Icon name={iconFor(state)} className={size === 'sm' ? 'size-3' : 'size-3.5'} />
    </span>
  );
}
