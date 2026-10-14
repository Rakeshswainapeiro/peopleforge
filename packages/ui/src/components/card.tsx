import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Section landmark name; renders a <section> labelled by it. */
  label?: string;
}

/** White panel on the grey canvas; the building block of every Figma screen. */
export function Card({ children, className, label }: CardProps) {
  const classes = cn('rounded-card border border-line bg-surface shadow-card', className);
  return label === undefined ? (
    <div className={classes}>{children}</div>
  ) : (
    <section aria-label={label} className={classes}>
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Heading level for document outline; visual size is fixed. */
  level?: 2 | 3;
}

export function CardHeader({ title, description, actions, level = 2 }: CardHeaderProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
      <div className="min-w-0">
        <Heading className="text-xl font-semibold tracking-tight text-ink">{title}</Heading>
        {description === undefined ? null : (
          <p className="mt-1 text-xs text-ink-muted">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap items-end gap-3">{actions}</div>
      )}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-6', className)}>{children}</div>;
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Muted variant used inside a card (Figma: report totals). */
  subtle?: boolean;
}

/** Figma: "Drafts 1 · Not yet submitted", "Current salary AED 21,500 · Per month". */
export function StatCard({ label, value, hint, subtle = false }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-card p-4',
        subtle ? 'bg-surface-muted' : 'border border-line bg-surface shadow-card',
      )}
    >
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="truncate text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
      {hint === undefined ? null : <p className="text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}
