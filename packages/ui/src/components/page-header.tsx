import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Small context line above the title (Figma: breadcrumb / role · requirement IDs). */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Top of every portal page: the page's only <h1>. */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow === undefined ? null : (
          <div className="mb-1 text-xs font-medium text-ink-muted">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description === undefined ? null : (
          <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      )}
    </header>
  );
}
