'use client';

import { Button } from '@peopleforge/ui';
import { createContext, use, useActionState, type ReactNode } from 'react';
import { saveDraft, type ProposalsFormState } from '@/app/(portal)/requests/actions';

interface DraftFormValue {
  formId: string;
  state: ProposalsFormState;
  pending: boolean;
}

const DraftFormContext = createContext<DraftFormValue | null>(null);

const INITIAL: ProposalsFormState = { rows: [] };

export interface DraftFormProps {
  formId: string;
  requestId: string;
  version: number;
  /** The employee whose criteria are shown, kept after a save. */
  employee?: string | undefined;
  editable: boolean;
  saveLabel: string;
  children: ReactNode;
}

/**
 * The one "Save draft" form of the request page. Its controls live in different cards (the
 * proposals table, the criteria of one employee) and join it with the `form` attribute, so
 * the Add-employee form can stay a separate form without nesting. The save's outcome is shared
 * with them through context, so a refused save keeps what was typed everywhere.
 */
export function DraftForm({
  formId,
  requestId,
  version,
  employee,
  editable,
  saveLabel,
  children,
}: DraftFormProps) {
  const [state, formAction, pending] = useActionState(saveDraft, INITIAL);
  return (
    <DraftFormContext value={{ formId, state, pending }}>
      <form id={formId} action={formAction} noValidate>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="version" value={version} />
        {employee === undefined ? null : <input type="hidden" name="employee" value={employee} />}
        {/* Enter in any field submits with the form's first submit button: make that "Save
            draft", never a row's remove button. Hidden from assistive tech: the visible one is
            in the page header. */}
        {editable ? (
          <Button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
            {saveLabel}
          </Button>
        ) : null}
      </form>
      {children}
    </DraftFormContext>
  );
}

export function useDraftForm(): DraftFormValue {
  const value = use(DraftFormContext);
  if (value === null) throw new Error('useDraftForm must be used inside <DraftForm>');
  return value;
}
