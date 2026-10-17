'use server';

import { PostMessageSchema } from '@peopleforge/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { errorKeyFor, type RequestErrorKey } from '@/lib/request-errors';
import { employeeStatusHref } from '@/lib/routes';
import { postMessage } from '@/server/conversations';
import { refreshPortalShell } from '@/server/portal-shell';

/** Server Action for questions and answers (R1-08). POST-only with an Origin check (CSRF). */

const Id = z.uuid();
const Key = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export interface MessageFormState {
  /** Counts posts, so the form starts afresh after each (empty when sent, else as typed). */
  attempt?: number;
  error?: RequestErrorKey;
  /** What was typed, kept when the message is refused. */
  body?: string;
}

/**
 * "Send" under an employee's conversation: posts the message, then re-renders the page in place
 * so the thread shows it. A refusal keeps the text.
 */
export async function postMessageAction(
  previous: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const requestId = Id.parse(field(formData, 'requestId'));
  const lineId = Id.parse(field(formData, 'lineId'));
  const attempt = (previous.attempt ?? 0) + 1;
  const typed = field(formData, 'body');
  const key = Key.safeParse(field(formData, 'messageKey'));
  const parsed = PostMessageSchema.safeParse({ body: typed });
  if (!parsed.success || !key.success) {
    return { attempt, error: 'request.errors.messageInvalid', body: typed };
  }
  const result = await postMessage(requestId, lineId, parsed.data.body, key.data);
  if (result.kind === 'ok') {
    refreshPortalShell();
    revalidatePath(employeeStatusHref(requestId, lineId));
    return { attempt };
  }
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  return {
    attempt,
    error:
      result.kind === 'error' ? errorKeyFor(result.code, result.details) : 'request.errors.generic',
    body: typed,
  };
}
