import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import {
  messageKeyFor,
  type ApiError,
  type ErrorCode,
  type ErrorDetail,
} from '@sirius/shared-types';
import { DomainError } from '../errors/domain-errors.js';
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

/** Nest's own HTTP exceptions (e.g. 404 for unknown routes) mapped to our codes. */
function mapHttpException(error: HttpException): Mapped {
  switch (error.getStatus()) {
    case 404: // Not Found
      return { status: 404, code: 'NOT_FOUND' };
    case 405: // Method Not Allowed
      return { status: 404, code: 'NOT_FOUND' };
    case 429: // Too Many Requests
      return { status: 429, code: 'RATE_LIMITED' };
    case 401: // Unauthorized
      return { status: 401, code: 'UNAUTHENTICATED' };
    case 403: // Forbidden
      return { status: 403, code: 'FORBIDDEN' };
    case 400: // Bad Request (e.g. a malformed multipart upload)
      return { status: 400, code: 'VALIDATION_FAILED' };
    case 413: // Payload Too Large (an upload over the multipart file limit)
      return { status: 413, code: 'PAYLOAD_TOO_LARGE' };
    case 503: // Service Unavailable (e.g. identity provider unreachable)
      return { status: 503, code: 'SERVICE_UNAVAILABLE' };
    default:
      return { status: 500, code: 'INTERNAL_ERROR' };
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
  if (error instanceof HttpException) {
    return mapHttpException(error);
  }
  return mapBodyParserError(error) ?? { status: 500, code: 'INTERNAL_ERROR' };
}

/**
 * The single place errors become HTTP responses: one shape, stable codes and message keys,
 * no stack traces or internal messages, and unexpected errors logged with the request ID.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const mapped = mapError(error);
    const requestId = getRequestId(res);

    if (mapped.status >= 500) {
      this.logger.error({ err: error, requestId }, 'Unhandled error');
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
  }
}
