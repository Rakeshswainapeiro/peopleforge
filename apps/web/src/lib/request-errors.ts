import type { ErrorCode, ErrorDetail } from '@sirius/shared-types';
import type { MessageKey } from '@/i18n/translator';

/** Messages a request page may show from its `?error=` parameter (anything else is ignored). */
export const REQUEST_ERROR_KEYS = [
  'request.errors.stale',
  'request.errors.duplicate',
  'request.errors.employeeNotFound',
  'request.errors.cycleNotOpen',
  'request.errors.rowsInvalid',
  'request.errors.chooseEmployee',
  'request.errors.notFound',
  'request.errors.justificationTooLong',
  'request.errors.generic',
] as const satisfies readonly MessageKey[];

export type RequestErrorKey = (typeof REQUEST_ERROR_KEYS)[number];

function has(details: readonly ErrorDetail[], path: string): boolean {
  return details.some((detail) => detail.path === path);
}

/** The message for an API refusal of a request change. */
export function errorKeyFor(code: ErrorCode, details: readonly ErrorDetail[]): RequestErrorKey {
  if (code === 'CONFLICT' && has(details, 'version')) return 'request.errors.stale';
  if (code === 'CONFLICT' && has(details, 'employeeId')) return 'request.errors.duplicate';
  if (code === 'VALIDATION_FAILED' && has(details, 'employeeId'))
    return 'request.errors.employeeNotFound';
  if (code === 'VALIDATION_FAILED' && has(details, 'cycleId')) return 'request.errors.cycleNotOpen';
  if (code === 'NOT_FOUND') return 'request.errors.notFound';
  if (code === 'VALIDATION_FAILED' && details.some((d) => d.path.endsWith('.justification'))) {
    return 'request.errors.justificationTooLong';
  }
  return 'request.errors.generic';
}

/** Messages an evidence upload or removal can end with (R1-04). */
export const EVIDENCE_ERROR_KEYS = [
  'evidence.errors.tooLarge',
  'evidence.errors.type',
  'evidence.errors.infected',
  'evidence.errors.limit',
  'evidence.errors.required',
  'evidence.errors.unavailable',
  'evidence.errors.notFound',
  'evidence.errors.generic',
  'evidence.errors.removeFailed',
] as const satisfies readonly MessageKey[];

export type EvidenceErrorKey = (typeof EVIDENCE_ERROR_KEYS)[number];

/** The message for an API refusal of an evidence upload. */
export function evidenceErrorKey(
  status: number,
  code: ErrorCode,
  details: readonly ErrorDetail[],
): EvidenceErrorKey {
  if (status === 413) return 'evidence.errors.tooLarge';
  if (code === 'NOT_FOUND') return 'evidence.errors.notFound';
  if (code === 'CONFLICT') return 'evidence.errors.limit';
  const fileProblem = details.find((detail) => detail.path === 'file')?.code;
  if (fileProblem === 'media_type') return 'evidence.errors.type';
  if (fileProblem === 'infected') return 'evidence.errors.infected';
  if (fileProblem === 'required') return 'evidence.errors.required';
  return 'evidence.errors.generic';
}

/** The message for one proposal the API refused (`proposals.N.value`). */
export function proposalErrorKey(code: string): MessageKey {
  switch (code) {
    case 'not_positive':
      return 'request.errors.notPositive';
    case 'over_limit':
      return 'request.errors.overLimit';
    default:
      return 'request.errors.format';
  }
}

/** Reads `?error=` safely: only known message keys are shown. */
export function parseErrorKey(value: unknown): RequestErrorKey | undefined {
  return REQUEST_ERROR_KEYS.find((key) => key === value);
}
