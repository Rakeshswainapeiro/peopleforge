'use client';

import { Alert, Button, Input } from '@peopleforge/ui';
import { useActionState } from 'react';
import { updateRuleAction, type GroupFormState } from '@/app/(portal)/group/actions';

export interface RuleFormProps {
  code: string;
  threshold: string | null;
  enabled: boolean;
  /** The threshold's unit ("%", "months"), or null for a rule without one. */
  unit: string | null;
  labels: {
    title: string;
    body: string;
    changed: string;
    on: string;
    threshold: string;
    save: string;
    saving: string;
    saved: string;
  };
  messages: readonly (readonly [string, string])[];
}

const INITIAL: GroupFormState = {};

/** One anomaly rule (R2-10): on or off, and its threshold. */
export function RuleForm({ code, threshold, enabled, unit, labels, messages }: RuleFormProps) {
  const [state, formAction, pending] = useActionState(updateRuleAction, INITIAL);
  const error =
    state.error === undefined ? undefined : (new Map(messages).get(state.error) ?? state.error);
  return (
    <form
      key={state.attempt ?? 0}
      action={formAction}
      noValidate
      aria-label={labels.title}
      className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0 md:flex-row md:items-end md:justify-between"
    >
      <input type="hidden" name="code" value={code} />
      <div className="max-w-xl">
        <h3 className="text-sm font-semibold text-ink">
          <span className="me-2 font-mono text-xs text-ink-muted">{code}</span>
          {labels.title}
        </h3>
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
        {unit === null ? null : (
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
            {`${labels.threshold} (${unit})`}
            <Input
              name="threshold"
              inputMode="decimal"
              defaultValue={threshold ?? ''}
              className="w-24"
            />
          </label>
        )}
        <Button type="submit" variant="secondary" loading={pending}>
          {pending ? labels.saving : labels.save}
        </Button>
        {state.done === true && !pending ? (
          <span role="status" className="pb-2 text-xs text-ink-muted">
            {labels.saved}
          </span>
        ) : null}
      </div>
    </form>
  );
}
