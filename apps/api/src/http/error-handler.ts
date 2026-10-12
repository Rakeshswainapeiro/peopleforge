import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import {
  messageKeyFor,
  type ApiError,
  type ErrorCode,
  type ErrorDetail,
} from '@sirius-hr/shared-types';
import { DomainError, NotFoundError } from '../errors/domain-errors.js';
import { getRequestId } from './locals.js';

interface Mapped {
  status: number;
  code: ErrorCode;
  details?: readonly ErrorDetail[];
}

function hasType(error: unknown): error is { type: string } {
  return (
    typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
  );
}

/** body-parser signals its failures through a `type` property rather than error classes. */
function mapBodyParserError(error: unknown): Mapped | undefined {
  if (!hasType(error)) return undefined;
  switch (error.type) {
    case 'entity.too.large':
      return { status: 413, code: 'PAYLOAD_TOO_LARGE' };
    case 'entity.parse.failed':
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return { status: 400, code: 'VALIDATION_FAILED' };
    default:
      return undefined;
  }
}

export function mapError(error: unknown): Mapped {
  if (error instanceof DomainError) {
    return {
      status: error.status,
      code: error.code,
      ...(error.details && { details: error.details }),
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_FAILED',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
    };
  }
  return mapBodyParserError(error) ?? { status: 500, code: 'INTERNAL_ERROR' };
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError('Route not found'));
}

/**
 * Single place where errors become HTTP responses: consistent shape, no stack traces or
 * internal messages to clients, and unexpected errors logged with the request ID.
 */
export function createErrorHandler(logger: Logger) {
  return (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const mapped = mapError(error);
    const requestId = getRequestId(res);

    if (mapped.status >= 500) {
      logger.error({ err: error, requestId }, 'Unhandled error');
    }

    const body: ApiError = {
      error: {
        code: mapped.code,
        messageKey: messageKeyFor(mapped.code),
        requestId,
        ...(mapped.details && { details: [...mapped.details] }),
      },
    };
    res.status(mapped.status).json(body);
  };
}
