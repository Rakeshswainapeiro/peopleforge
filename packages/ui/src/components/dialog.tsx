'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { lockPageScroll } from '../lib/scroll-lock.js';

/** How long the closing fade takes; the <dialog> leaves the top layer after it. */
export const DIALOG_EXIT_MS = 150;

export interface DialogProps {
  open: boolean;
  /** Called on Esc, the backdrop or a cancel button: the parent closes it. */
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** The buttons, end-aligned (cancel first, the action last). */
  actions: ReactNode;
  /**
   * `alertdialog` for confirmations of something that can't be undone (screen readers announce
   * it as such); `dialog` otherwise.
   */
  role?: 'dialog' | 'alertdialog';
  /** False while an action runs: Esc and the backdrop then do nothing. */
  dismissible?: boolean;
  className?: string;
}

/**
 * A modal on the native <dialog> element: the page behind is inert, focus is trapped and returns
 * to the opener, Esc closes it, and the page behind doesn't scroll (or shift: `lockPageScroll`).
 *
 * Its layout doesn't depend on the browser's default dialog styles (which differ, and Tailwind's
 * reset removes the centring margin in some): the <dialog> is a transparent full-viewport layer
 * that centres the panel with flexbox and draws its own backdrop. Opening and closing fade and
 * scale; the state is a DOM attribute (`data-state`) set after the dialog is shown, so the
 * transition always has a starting point, and closing waits for the fade before leaving the top
 * layer.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  role = 'dialog',
  dismissible = true,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const unlockScroll = useRef<(() => void) | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- React sets refs before effects run, and both elements are always rendered
    const dialog = ref.current!;
    if (open) {
      if (!dialog.open) {
        unlockScroll.current = lockPageScroll();
        dialog.showModal();
      }
      // Resolve the closed styles first, so the change below transitions instead of jumping.
      dialog.getBoundingClientRect();
      dialog.dataset.state = 'open';
      // The panel, not the first button: no focus ring flashes on open; Tab reaches the actions.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- see above
      panel.current!.focus();
      return undefined;
    }
    dialog.dataset.state = 'closed';
    if (!dialog.open) return undefined;
    const timer = setTimeout(() => {
      dialog.close();
      unlockScroll.current?.();
      unlockScroll.current = null;
    }, DIALOG_EXIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [open]);

  // Leaving the page with the dialog open (e.g. a redirect after submitting) unlocks scrolling.
  useEffect(
    () => () => {
      unlockScroll.current?.();
    },
    [],
  );

  const dismiss = () => {
    if (dismissible) onClose();
  };

  return (
    <dialog
      ref={ref}
      role={role}
      data-state="closed"
      aria-labelledby={titleId}
      aria-describedby={children === undefined ? undefined : bodyId}
      onCancel={(event) => {
        // Esc: the parent owns `open`, and decides (after the exit animation) when it closes.
        event.preventDefault();
        dismiss();
      }}
      className={cn(
        // The whole window (100vw/100dvh, not 100%): with a reserved scrollbar gutter, `100%` is
        // narrower than the window and the panel would sit off-centre.
        'group fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-transparent p-4 backdrop:bg-transparent',
        'open:flex open:items-center open:justify-center',
      )}
    >
      <div
        data-testid="dialog-backdrop"
        aria-hidden="true"
        onClick={dismiss}
        className="fixed inset-0 h-dvh w-screen bg-ink/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-data-[state=open]:duration-200 ease-[var(--ease-standard)] group-data-[state=open]:opacity-100"
      />
      <div
        ref={panel}
        data-testid="dialog-panel"
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-md rounded-card border border-line bg-surface text-ink shadow-raised outline-none',
          'translate-y-2 scale-[0.97] opacity-0 transition-[opacity,transform] duration-150 ease-[var(--ease-standard)] group-data-[state=open]:duration-200',
          'group-data-[state=open]:translate-y-0 group-data-[state=open]:scale-100 group-data-[state=open]:opacity-100',
          className,
        )}
      >
        <div className="flex flex-col gap-3 p-6">
          <h2 id={titleId} className="text-lg font-semibold text-balance">
            {title}
          </h2>
          {children === undefined ? null : (
            <div id={bodyId} className="text-sm leading-relaxed text-ink-muted">
              {children}
            </div>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-3">{actions}</div>
        </div>
      </div>
    </dialog>
  );
}
