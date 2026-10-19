'use client';

import { Alert, Button, Field, Select, Textarea } from '@peopleforge/ui';
import { useActionState } from 'react';
import {
  remindFlagAction,
  updateFlagAction,
  type GroupFormState,
} from '@/app/(portal)/group/actions';

export interface FlagFormProps {
  flagId: string;
  ownerId: string;
  status: string;
  note: string;
  owners: readonly { value: string; label: string }[];
  statuses: readonly { value: string; label: string }[];
  /** Sirius HR can send the owner a reminder. */
  canRemind: boolean;
  labels: {
    form: string;
    owner: string;
    status: string;
    note: string;
    noteHint: string;
    save: string;
    saving: string;
    saved: string;
    remind: string;
    reminding: string;
    reminded: string;
  };
  messages: readonly (readonly [string, string])[];
}

const INITIAL: GroupFormState = {};

/**
 * Figma "Flag detail": owner, status and resolution note (R2-11), and "Send reminder" for
 * Sirius HR. Resolving needs a note; the API records every change in the flag's activity.
 */
export function FlagForm({
  flagId,
  ownerId,
  status,
  note,
  owners,
  statuses,
  canRemind,
  labels,
  messages,
}: FlagFormProps) {
  const [state, formAction, pending] = useActionState(updateFlagAction, INITIAL);
  const [remindState, remindAction, reminding] = useActionState(remindFlagAction, INITIAL);
  const texts = new Map(messages);
  const errorKey = state.error ?? remindState.error;
  const error = errorKey === undefined ? undefined : (texts.get(errorKey) ?? errorKey);
  return (
    <div className="flex flex-col gap-4">
      <form
        key={state.attempt ?? 0}
        action={formAction}
        aria-label={labels.form}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="flagId" value={flagId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={labels.owner}>
            {(ids) => (
              <Select id={ids.id} name="ownerId" defaultValue={ownerId}>
                {owners.map((owner) => (
                  <option key={owner.value} value={owner.value}>
                    {owner.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={labels.status}>
            {(ids) => (
              <Select id={ids.id} name="status" defaultValue={status}>
                {statuses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={labels.note} hint={labels.noteHint}>
          {(ids) => (
            <Textarea
              id={ids.id}
              aria-describedby={ids.describedBy}
              name="note"
              rows={4}
              maxLength={2000}
              defaultValue={note}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending}>
            {pending ? labels.saving : labels.save}
          </Button>
          {state.done === true && !pending ? (
            <span role="status" className="text-sm text-ink-muted">
              {labels.saved}
            </span>
          ) : null}
        </div>
      </form>
      {canRemind ? (
        <form action={remindAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="flagId" value={flagId} />
          <Button type="submit" variant="secondary" icon="bell" loading={reminding}>
            {reminding ? labels.reminding : labels.remind}
          </Button>
          {remindState.done === true && !reminding ? (
            <span role="status" className="text-sm text-ink-muted">
              {labels.reminded}
            </span>
          ) : null}
        </form>
      ) : null}
      {error === undefined ? null : <Alert role="alert" tone="danger" title={error} />}
    </div>
  );
}
