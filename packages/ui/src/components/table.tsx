import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { transition } from '../lib/focus.js';

export interface TableProps {
  /** Accessible table name (visually hidden caption). */
  caption: string;
  children: ReactNode;
  className?: string;
}

/** Data table from the Figma lists. Scrolls horizontally inside its card on narrow screens. */
export function Table({ caption, children, className }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-line">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Tr({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        'hover:bg-surface-muted',
        selected && 'bg-brand-50/60 hover:bg-brand-50',
        transition,
      )}
    >
      {children}
    </tr>
  );
}

export interface ThProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  /** `end` for numeric columns, so the heading lines up with right-aligned figures. */
  align?: 'start' | 'end';
}

export function Th({ className, scope = 'col', align = 'start', ...props }: ThProps) {
  return (
    <th
      {...props}
      scope={scope}
      className={cn(
        'whitespace-nowrap px-3 py-3 text-xs font-medium text-ink',
        align === 'end' ? 'text-end' : 'text-start',
        className,
      )}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cn('px-3 py-4 align-middle text-ink', className)} />;
}

/** Two-line cell: primary text over a muted line (Figma: "Omar Haddad / EMP-3318 · G7"). */
export function CellStack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="font-semibold text-ink">{primary}</span>
      {secondary === undefined ? null : <span className="text-xs text-ink-muted">{secondary}</span>}
    </div>
  );
}
