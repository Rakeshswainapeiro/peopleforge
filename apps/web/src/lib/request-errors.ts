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
  return 'request.errors.generic';
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
