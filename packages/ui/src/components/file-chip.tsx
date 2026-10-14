import type { ReactNode } from 'react';
import { Icon } from '../icons/icon.js';
import { cn } from '../lib/cn.js';
import { focusRing, transition } from '../lib/focus.js';

export interface FileChipProps {
  name: string;
  /** e.g. "PDF · 240 KB". */
  meta: string;
  /** Download link (served after an authorisation check, never a public URL). */
  href: string;
  /** Accessible name of the link, e.g. "Download appraisal.pdf". */
  downloadLabel: string;
  /** A remove control (e.g. an icon button), when the file can be removed. */
  action?: ReactNode;
  className?: string;
}

/** An attached evidence file (Figma: paperclip chip under a criterion). */
export function FileChip({ name, meta, href, downloadLabel, action, className }: FileChipProps) {
  return (
    <div
      className={cn(
        'flex max-w-full items-center gap-2 rounded-control border border-line bg-surface-muted py-1 ps-2 pe-1',
        className,
      )}
    >
      <Icon name="paperclip" className="size-4 shrink-0 text-ink-muted" />
      <a
        href={href}
        download
        aria-label={downloadLabel}
        className={cn(
          'min-w-0 truncate text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline',
          transition,
          focusRing,
        )}
      >
        {name}
      </a>
      <span className="shrink-0 text-xs text-ink-subtle">{meta}</span>
      {action}
    </div>
  );
}
