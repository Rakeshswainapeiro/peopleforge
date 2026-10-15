'use server';

import {
  CriterionResultSchema,
  DecimalString,
  MAX_EVIDENCE_FILE_MB,
  type CriterionInput,
  type ProposedKind,
} from '@peopleforge/contracts';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { MessageKey } from '@/i18n/translator';
import {
  errorKeyFor,
  evidenceErrorKey,
  proposalErrorKey,
  type EvidenceErrorKey,
  type RequestErrorKey,
} from '@/lib/request-errors';
import type { ApiResult } from '@/server/api-client';
import {
  addEmployee,
  createRequest,
  removeEmployee,
  removeEvidence,
  saveDraftChanges,
  submitRequest,
  uploadEvidence,
} from '@/server/increment-requests';
import { refreshPortalShell } from '@/server/portal-shell';

/**
 * Server Actions for the request editor (R1-02, R1-03, R1-04). POST-only with an Origin check
 * (CSRF); every field is re-validated here and again by the API, which also enforces the
 * user's subsidiary.
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

/** What was typed for one criterion, kept when a save is refused. */
export interface CriterionTypedState {
  criterionId: string;
  result: string;
  justification: string;
}

export interface ProposalsFormState {
  error?: RequestErrorKey;
  /** What the user typed, per line, so a refused save keeps their input. */
  rows: ProposalRowState[];
  /** The criteria typed for the employee being assessed, likewise. */
  criteria?: { lineId: string; results: CriterionTypedState[] };
}

/** One employee's criteria from the form (fields `result:<id>`, `justification:<id>`). */
function readAssessment(formData: FormData) {
  const lineId = Id.safeParse(field(formData, 'assessmentLineId'));
  if (!lineId.success) return undefined;
  const typed: CriterionTypedState[] = [];
  const results: CriterionInput[] = [];
  for (const value of formData.getAll('criterionId')) {
    const criterionId = Id.parse(value);
    const result = field(formData, `result:${criterionId}`);
    const justification = field(formData, `justification:${criterionId}`);
    typed.push({ criterionId, result, justification });
    results.push({
      criterionId,
      result: CriterionResultSchema.safeParse(result).data ?? null,
      // The textarea's maxLength stops longer text; the API refuses anything that slips past.
      justification: justification.normalize('NFC'),
    });
  }
  return {
    typed: { lineId: lineId.data, results: typed },
    input: { lineId: lineId.data, results },
  };
}

/**
 * "Save draft": the whole table and the assessed employee's criteria at once, all or nothing.
 * The pencil of a row submits the same form with `selectLine`, so moving to another employee
 * never loses what was typed for the previous one.
 */
export async function saveDraft(
  _previous: ProposalsFormState,
  formData: FormData,
): Promise<ProposalsFormState> {
  const requestId = Id.parse(field(formData, 'requestId'));
  const version = z.coerce.number().int().min(1).parse(field(formData, 'version'));
  const lineIds = formData.getAll('lineId').map((value) => Id.parse(value));
  const assessment = readAssessment(formData);
  const next = Id.safeParse(field(formData, 'selectLine'));
  const current = Id.safeParse(field(formData, 'employee'));

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
  const keep = (error: RequestErrorKey): ProposalsFormState => ({
    error,
    rows,
    ...(assessment === undefined ? {} : { criteria: assessment.typed }),
  });
  if (rows.some((row) => row.error !== undefined)) return keep('request.errors.rowsInvalid');

  const result = await saveDraftChanges(requestId, {
    version,
    proposals,
    ...(assessment === undefined ? {} : { assessment: assessment.input }),
  });
  if (result.kind === 'ok') {
    if (field(formData, 'intent') === 'submit') {
      await submitSaved(requestId, result.data.version, field(formData, 'submitKey'));
    }
    if (next.success) redirect(`/requests/${requestId}?employee=${next.data}#criteria`);
    const employee = current.success ? `&employee=${current.data}` : '';
    redirect(`/requests/${requestId}?saved=1${employee}`);
  }
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind === 'unavailable') return keep('request.errors.generic');

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
  return keep(rowErrors ? 'request.errors.rowsInvalid' : errorKeyFor(result.code, result.details));
}

/**
 * "Submit to Sirius HR" in the confirmation dialog (R1-07). It posts the draft form, so what is
 * on screen is saved first; then the saved version is submitted. Either way the page reloads:
 * after a refusal the draft's version has moved on, so the form must start afresh.
 */
async function submitSaved(requestId: string, version: number, keyInput: string): Promise<never> {
  const key = Key.safeParse(keyInput);
  if (!key.success) redirect(`/requests/${requestId}?error=request.errors.generic`);
  const result = await submitRequest(requestId, version, key.data);
  if (result.kind === 'ok') {
    refreshPortalShell();
    redirect(`/requests/${requestId}?submitted=1`);
  }
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  const error =
    result.kind === 'error' ? errorKeyFor(result.code, result.details) : 'request.errors.generic';
  redirect(`/requests/${requestId}?error=${error}`);
}

export type EvidenceActionResult = { ok: true } | { ok: false; error: EvidenceErrorKey };

const MAX_BYTES = MAX_EVIDENCE_FILE_MB * 1024 * 1024;

/**
 * "Attach file" under a criterion (R1-04). Called from the client with the chosen file; the
 * page refreshes afterwards. Size and type are judged again by the API (type from content).
 */
export async function uploadEvidenceAction(formData: FormData): Promise<EvidenceActionResult> {
  const requestId = Id.parse(field(formData, 'requestId'));
  const lineId = Id.parse(field(formData, 'lineId'));
  const criterionId = Id.parse(field(formData, 'criterionId'));
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'evidence.errors.required' };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: 'evidence.errors.tooLarge' };
  const upload = new FormData();
  upload.set('lineId', lineId);
  upload.set('criterionId', criterionId);
  upload.set('file', file, file.name);
  const result = await uploadEvidence(requestId, upload);
  switch (result.kind) {
    case 'ok':
      return { ok: true };
    case 'unauthenticated':
      return redirect('/session-ended');
    case 'unavailable':
      return { ok: false, error: 'evidence.errors.unavailable' };
    case 'error':
      return { ok: false, error: evidenceErrorKey(result.status, result.code, result.details) };
  }
}

/** The remove button of a file chip: a soft delete, refreshed by the caller. */
export async function removeEvidenceAction(
  requestIdInput: string,
  evidenceIdInput: string,
): Promise<EvidenceActionResult> {
  const result = await removeEvidence(Id.parse(requestIdInput), Id.parse(evidenceIdInput));
  if (result.kind === 'ok') return { ok: true };
  if (result.kind === 'unauthenticated') return redirect('/session-ended');
  return { ok: false, error: 'evidence.errors.removeFailed' };
}
