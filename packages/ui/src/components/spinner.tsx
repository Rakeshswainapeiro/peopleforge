import { cn } from '../lib/cn.js';

/** Indeterminate progress. Decorative unless given a label. */
export function Spinner({ label, className }: { label?: string | undefined; className?: string }) {
  return (
    <span
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'status', 'aria-label': label })}
      className={cn(
        'inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-e-transparent',
        className,
      )}
    />
  );
}

/** Placeholder block while content loads (shape only; announce loading elsewhere). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-control bg-line', className)}
    />
  );
}
