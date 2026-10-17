'use client';

import { Button } from '@peopleforge/ui';
import { useFormStatus } from 'react-dom';

export interface VerifyToggleProps {
  /** The bound Server Action: verifies, or undoes, one criterion of one employee. */
  action: () => Promise<void>;
  verified: boolean;
  /** Visible text: "Mark verified" or "Undo". */
  text: string;
  /** Accessible name naming the criterion and employee. */
  label: string;
}

function Submit({ verified, text, label }: Omit<VerifyToggleProps, 'action'>) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="compact"
      variant={verified ? 'ghost' : 'outline'}
      icon={verified ? undefined : 'check'}
      loading={pending}
      aria-label={label}
    >
      {text}
    </Button>
  );
}

/**
 * Sirius HR's "Mark verified" on a criterion (R1-07, R1-10), or "Undo". A plain form posting a
 * bound Server Action, so it works without JavaScript; with it, the button shows it is busy.
 */
export function VerifyToggle({ action, verified, text, label }: VerifyToggleProps) {
  return (
    <form action={action}>
      <Submit verified={verified} text={text} label={label} />
    </form>
  );
}
