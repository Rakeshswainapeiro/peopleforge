'use server';

import { DecimalString, type ProposedKind } from '@peopleforge/contracts';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { MessageKey } from '@/i18n/translator';
import { errorKeyFor, proposalErrorKey, type RequestErrorKey } from '@/lib/request-errors';
import type { ApiResult } from '@/server/api-client';
import {
  addEmployee,
  createRequest,
  removeEmployee,
  saveProposals,
} from '@/server/increment-requests';

/**
 * Server Actions for the request editor (R1-02). POST-only with an Origin check (CSRF); every
 * field is re-validated here and again by the API, which also enforces the user's subsidiary.
 */

const Id = z.uuid();
const Key = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Where to go after a change: back to the request, with a message when it failed. */
function outcome(result: ApiResult<{ id: string }>, fallbackPath: string): never {
  if (result.kind === 'ok') redirect(`/requests/${result.data.id}`);
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  const key =
    result.kind === 'error' ? errorKeyFor(result.code, result.details) : 'request.errors.generic';
  redirect(`${fallbackPath}?error=${key}`);
}

/** "Add" on a new request: creates the draft with its first employee. */
export async function startRequest(formData: FormData): Promise<never> {
  const parsed = z
    .object({
      cycleId: Id,
      entityId: Id,
      employeeId: Id,
      idempotencyKey: Key,
    })
    .safeParse(
      Object.fromEntries(
        ['cycleId', 'entityId', 'employeeId', 'idempotencyKey'].map((name) => [
          name,
          field(formData, name),
        ]),
      ),
    );
  if (!parsed.success) redirect('/requests/new?error=request.errors.chooseEmployee');
  const { cycleId, entityId, employeeId, idempotencyKey } = parsed.data;
  outcome(
    await createRequest({ cycleId, entityId, employeeIds: [employeeId] }, idempotencyKey),
    '/requests/new',
  );
}

export async function addEmployeeAction(formData: FormData): Promise<never> {
  const requestId = Id.parse(field(formData, 'requestId'));
  const employeeId = Id.safeParse(field(formData, 'employeeId'));
  if (!employeeId.success) redirect(`/requests/${requestId}?error=request.errors.chooseEmployee`);
  outcome(await addEmployee(requestId, employeeId.data), `/requests/${requestId}`);
}

/**
 * The trash button of a row. The line ID is bound to the action (`.bind(null, lineId)`):
 * React overrides a button's `name` when its formAction is a function, so a name/value pair
 * would never reach the server.
 */
export async function removeEmployeeAction(
  lineIdInput: string,
  formData: FormData,
): Promise<never> {
  const requestId = Id.parse(field(formData, 'requestId'));
  const lineId = Id.parse(lineIdInput);
  const result = await removeEmployee(requestId, lineId);
  // Removing the last employee discards the draft: back to Home, which says so.
  if (result.kind === 'ok' && result.data.discarded) redirect('/?discarded=1');
  outcome(
    result.kind === 'ok' ? { kind: 'ok', data: { id: requestId } } : result,
    `/requests/${requestId}`,
  );
}

export interface ProposalRowState {
  lineId: string;
  kind: string;
  value: string;
  error?: MessageKey;
}

export interface ProposalsFormState {
  error?: RequestErrorKey;
  /** What the user typed, per line, so a refused save keeps their input. */
  rows: ProposalRowState[];
}

/** "Save draft": the whole table at once, all or nothing. */
export async function saveDraft(
  _previous: ProposalsFormState,
  formData: FormData,
): Promise<ProposalsFormState> {
  const requestId = Id.parse(field(formData, 'requestId'));
  const version = z.coerce.number().int().min(1).parse(field(formData, 'version'));
  const lineIds = formData.getAll('lineId').map((value) => Id.parse(value));

  const rows: ProposalRowState[] = [];
  const proposals: { lineId: string; kind: ProposedKind | null; value: string | null }[] = [];
  for (const lineId of lineIds) {
    const kind: ProposedKind =
      field(formData, `kind:${lineId}`) === 'amount' ? 'amount' : 'percent';
    const typed = field(formData, `value:${lineId}`);
    // Accept what people type: "6 %", "1,720", " 7.5 ".
    const value = typed.replace(/[\s,%]/gu, '');
    const row: ProposalRowState = { lineId, kind, value: typed };
    if (value === '') {
      proposals.push({ lineId, kind: null, value: null });
    } else if (DecimalString.safeParse(value).success) {
      proposals.push({ lineId, kind, value });
    } else {
      row.error = 'request.errors.format';
    }
    rows.push(row);
  }
  if (rows.some((row) => row.error !== undefined)) {
    return { error: 'request.errors.rowsInvalid', rows };
  }

  const result = await saveProposals(requestId, { version, proposals });
  if (result.kind === 'ok') redirect(`/requests/${requestId}?saved=1`);
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind === 'unavailable') return { error: 'request.errors.generic', rows };

  let rowErrors = false;
  for (const detail of result.details) {
    const match = /^proposals\.(\d+)\.value$/u.exec(detail.path);
    const lineId = match === null ? undefined : proposals.at(Number(match[1]))?.lineId;
    const row = rows.find((candidate) => candidate.lineId === lineId);
    if (row !== undefined) {
      row.error = proposalErrorKey(detail.code);
      rowErrors = true;
    }
  }
  return {
    error: rowErrors ? 'request.errors.rowsInvalid' : errorKeyFor(result.code, result.details),
    rows,
  };
}
