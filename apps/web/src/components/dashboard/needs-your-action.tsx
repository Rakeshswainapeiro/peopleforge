'use client';

import { Button } from '@peopleforge/ui';
import { useId, useState, type ReactNode } from 'react';

export interface NeedsYourActionProps {
  title: string;
  /** Accessible name of the ✕ button. */
  hideLabel: string;
  /** The items (rendered on the server): drafts to continue, later requests to answer. */
  children: ReactNode;
}

/**
 * Figma "Needs your action". ✕ hides it until the next visit (nothing is stored: the items are
 * still there and come back on reload), so it can't hide work for good.
 */
export function NeedsYourAction({ title, hideLabel, children }: NeedsYourActionProps) {
  const [hidden, setHidden] = useState(false);
  const titleId = useId();
  if (hidden) return null;
  return (
    <section
      aria-labelledby={titleId}
      className="mt-6 animate-enter rounded-card border border-warning-200 bg-warning-50/60 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-sm font-semibold text-warning-700">
          {title}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          icon="x"
          aria-label={hideLabel}
          onClick={() => {
            setHidden(true);
          }}
        />
      </div>
      {children}
    </section>
  );
}
