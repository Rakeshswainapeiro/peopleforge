'use server';

import {
  ApprovedPercentSchema,
  ChangeReasonSchema,
  DecideLineSchema,
  MAX_COMMENT_LENGTH,
  type DecideLine,
} from '@peopleforge/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { errorKeyFor, type RequestErrorKey } from '@/lib/request-errors';
import { employeeStatusHref } from '@/lib/routes';
import { decideEmployee, verifyCriterion } from '@/server/increment-requests';
import { refreshPortalShell } from '@/server/portal-shell';

/**
 * Server Actions for Sirius HR's review (R1-07 … R1-09). POST-only with an Origin check (CSRF);
 * every value is re-validated here and again by the API, which also checks the permission.
 */

const Id = z.uuid();
const Key = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * "Mark verified" or "Undo" on one criterion. The IDs are bound to the action, so a form can't
 * point it elsewhere. On success the page re-renders in place (the reviewer keeps their scroll
 * position while ticking criteria); a refusal reloads it with a message.
 */
export async function verifyAction(
  requestIdInput: string,
  lineIdInput: string,
  criterionIdInput: string,
  verified: boolean,
): Promise<void> {
  const requestId = Id.parse(requestIdInput);
  const lineId = Id.parse(lineIdInput);
  const result = await verifyCriterion(requestId, lineId, Id.parse(criterionIdInput), verified);
  const page = employeeStatusHref(requestId, lineId);
  if (result.kind === 'ok') {
    revalidatePath(page);
    return;
  }
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  const error =
    result.kind === 'error' ? errorKeyFor(result.code, result.details) : 'request.errors.generic';
  redirect(`${page}?error=${error}`);
}

export interface DecisionFormState {
  /** Counts refusals, so the panel starts its fields afresh from `values` after each. */
  attempt?: number;
  error?: RequestErrorKey;
  /** What was chosen and typed, kept when the decision is refused. */
  values?: Record<string, string>;
}

/** The decision as the API takes it, from the panel's fields; null when they don't fit. */
function readDecision(formData: FormData): DecideLine | null {
  const decision = field(formData, 'decision');
  const comment = field(formData, 'comment').slice(0, MAX_COMMENT_LENGTH + 1);
  const reasonCode = field(formData, 'reasonCode');
  if (decision === 'approved' && field(formData, 'change') !== 'on') {
    return { decision: 'approved' };
  }
  const body =
    decision === 'approved'
      ? {
          decision,
          // Accept what people type: "4.5 %", " 4,5" is not a decimal and is refused.
          approvedPercent: field(formData, 'approvedPercent').replace(/[\s%]/gu, ''),
          reasonCode: ChangeReasonSchema.safeParse(reasonCode).data,
          comment,
        }
      : { decision, reasonCode, comment };
  const parsed = DecideLineSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * Approve, Reject or Return in the Decision panel (R1-08, R1-09). On success the page reloads
 * with `?decided=…` (the summary and "Next employee"); a refusal keeps what was typed.
 */
export async function decideAction(
  previous: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const requestId = Id.parse(field(formData, 'requestId'));
  const lineId = Id.parse(field(formData, 'lineId'));
  const values = Object.fromEntries(
    ['decision', 'change', 'approvedPercent', 'reasonCode', 'comment'].map((name) => [
      name,
      field(formData, name),
    ]),
  );
  const attempt = (previous.attempt ?? 0) + 1;
  const key = Key.safeParse(field(formData, 'decisionKey'));
  const body = readDecision(formData);
  if (body === null || !key.success) {
    const percent = field(formData, 'approvedPercent').replace(/[\s%]/gu, '');
    const badPercent =
      values.decision === 'approved' &&
      values.change === 'on' &&
      !ApprovedPercentSchema.safeParse(percent).success;
    return {
      attempt,
      error: badPercent ? 'request.errors.percentRange' : 'request.errors.decisionInvalid',
      values,
    };
  }
  const result = await decideEmployee(requestId, lineId, body, key.data);
  if (result.kind === 'ok') {
    refreshPortalShell();
    redirect(`${employeeStatusHref(requestId, lineId)}?decided=${body.decision}`);
  }
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  return {
    attempt,
    error:
      result.kind === 'error' ? errorKeyFor(result.code, result.details) : 'request.errors.generic',
    values,
  };
}
