'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface DialogProps {
  open: boolean;
  /** Called on Esc, the backdrop or a cancel button: the parent closes it. */
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** The buttons, end-aligned (cancel first, the action last). */
  actions: ReactNode;
  className?: string;
}

/**
 * A modal dialog on the native <dialog> element: focus moves into it and is trapped, Esc
 * closes it, the page behind is inert, and focus returns to the opener on close.
 */
export function Dialog({ open, onClose, title, children, actions, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- React sets the ref before effects run, and the <dialog> is always rendered
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: let the parent decide (it owns `open`).
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-auto w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-ink/40',
        className,
      )}
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children === undefined ? null : <div className="text-sm text-ink-muted">{children}</div>}
        <div className="mt-2 flex flex-wrap justify-end gap-3">{actions}</div>
      </div>
    </dialog>
  );
}
