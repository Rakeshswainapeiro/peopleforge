'use client';

import { Alert, Button, Input } from '@peopleforge/ui';
import { useActionState } from 'react';
import { updateReminderAction, type ReminderFormState } from '@/app/(portal)/settings/actions';

export interface ReminderRuleFormProps {
  kind: string;
  days: number;
  enabled: boolean;
  maxDays: number;
  labels: {
    title: string;
    body: string;
    changed: string;
    on: string;
    days: string;
    save: string;
    saving: string;
    saved: string;
  };
  messages: readonly (readonly [string, string])[];
}

const INITIAL: ReminderFormState = {};

/** One reminder trigger (R1-13): on or off, and after how many days. */
export function ReminderRuleForm({
  kind,
  days,
  enabled,
  maxDays,
  labels,
  messages,
}: ReminderRuleFormProps) {
  const [state, formAction, pending] = useActionState(updateReminderAction, INITIAL);
  const texts = new Map(messages);
  const error = state.error === undefined ? undefined : (texts.get(state.error) ?? state.error);
  return (
    <form
      key={state.attempt ?? 0}
      action={formAction}
      noValidate
      aria-label={labels.title}
      className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0 md:flex-row md:items-end md:justify-between"
    >
      <input type="hidden" name="kind" value={kind} />
      <div className="max-w-xl">
        <h3 className="text-sm font-semibold text-ink">{labels.title}</h3>
        <p className="mt-1 text-sm text-ink-muted">{labels.body}</p>
        <p className="mt-1 text-xs text-ink-subtle">{labels.changed}</p>
        {error === undefined ? null : (
          <Alert role="alert" tone="danger" title={error} className="mt-2" />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            className="size-4 rounded accent-brand-600"
          />
          {labels.on}
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
          {labels.days}
          <Input
            name="days"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxDays}
            defaultValue={days}
            className="w-24"
          />
        </label>
        <Button type="submit" variant="secondary" loading={pending}>
          {pending ? labels.saving : labels.save}
        </Button>
        {state.saved === true && !pending ? (
          <span role="status" className="pb-2 text-xs text-ink-muted">
            {labels.saved}
          </span>
        ) : null}
      </div>
    </form>
  );
}
