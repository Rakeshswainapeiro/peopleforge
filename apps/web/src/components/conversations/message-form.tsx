'use client';

import { Alert, Button, Field, Textarea } from '@peopleforge/ui';
import { useActionState } from 'react';
import { postMessageAction, type MessageFormState } from '@/app/(portal)/conversations/actions';

export interface MessageFormProps {
  requestId: string;
  lineId: string;
  /** Idempotency key for this page view: a double click can't send twice. */
  messageKey: string;
  maxLength: number;
  labels: { message: string; placeholder: string; send: string; sending: string; sent: string };
  /** Translated texts for the error keys, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
}

const INITIAL: MessageFormState = {};

/** Ask or answer about an employee (R1-08); the thread above refreshes when it is sent. */
export function MessageForm({
  requestId,
  lineId,
  messageKey,
  maxLength,
  labels,
  messages,
}: MessageFormProps) {
  const [state, formAction, pending] = useActionState(postMessageAction, INITIAL);
  const texts = new Map(messages);
  const error = state.error === undefined ? undefined : (texts.get(state.error) ?? state.error);
  const sent = state.attempt !== undefined && state.error === undefined;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="lineId" value={lineId} />
      {/* A new key per message: the page re-renders with a fresh one after each send. */}
      <input
        type="hidden"
        name="messageKey"
        value={`${messageKey}-${String(state.attempt ?? 0)}`}
      />
      {error === undefined ? null : <Alert role="alert" tone="danger" title={error} />}
      <Field label={labels.message}>
        {(ids) => (
          <Textarea
            // Afresh after each post: empty when sent, as typed when refused.
            key={state.attempt ?? 0}
            id={ids.id}
            aria-describedby={ids.describedBy}
            name="body"
            required
            maxLength={maxLength}
            defaultValue={state.body}
            placeholder={labels.placeholder}
          />
        )}
      </Field>
      <div className="flex items-center justify-end gap-3">
        {sent && !pending ? (
          <span role="status" className="text-xs text-ink-muted">
            {labels.sent}
          </span>
        ) : null}
        <Button type="submit" icon="message" loading={pending}>
          {pending ? labels.sending : labels.send}
        </Button>
      </div>
    </form>
  );
}
