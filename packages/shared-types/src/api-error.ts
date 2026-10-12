import { z } from 'zod';

/**
 * Stable machine-readable error codes. Clients localise via `messageKey`, never by parsing
 * free text, so messages can be translated (en/ar) without API changes.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorDetailSchema = z.object({
  path: z.string(),
  code: z.string(),
});
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    messageKey: z.string(),
    requestId: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function messageKeyFor(code: ErrorCode): string {
  return `errors.${code}`;
}
