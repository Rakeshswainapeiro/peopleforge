import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon.js';

export interface EmptyStateProps {
  icon?: IconName | undefined;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/** Shown instead of an empty table or list: says why it's empty and what to do next. */
export function EmptyState({ icon = 'file', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-ink-muted"
      >
        <Icon name={icon} className="size-5" />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-sm text-xs text-ink-muted">{description}</p>
      )}
      {action === undefined ? null : <div className="mt-1">{action}</div>}
    </div>
  );
}
