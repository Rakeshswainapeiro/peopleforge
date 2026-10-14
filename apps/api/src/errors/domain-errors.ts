import type { ErrorCode, ErrorDetail } from '@sirius/shared-types';

/**
 * Base for every error a client is allowed to learn about. Anything that is not a DomainError
 * is treated as unexpected and surfaced as INTERNAL_ERROR without details.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;

  constructor(
    message: string,
    readonly details?: readonly ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const;
  readonly status = 400;
}

export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED' as const;
  readonly status = 401;
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN' as const;
  readonly status = 403;
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;
  readonly status = 404;
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const;
  readonly status = 409;
}

export class PayloadTooLargeError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE' as const;
  readonly status = 413;
}

/** A dependency (database, identity provider) is down: clients may retry later. */
export class DependencyUnavailableError extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE' as const;
  readonly status = 503;
}
