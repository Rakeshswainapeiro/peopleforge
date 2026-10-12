import type { Response } from 'express';

/**
 * Typed accessors for per-request state. Express types `res.locals` as `any`, so all reads go
 * through here to keep `any` out of the codebase.
 */
export function setRequestId(res: Response, requestId: string): void {
  res.locals.requestId = requestId;
}

export function getRequestId(res: Response): string {
  const value: unknown = res.locals.requestId;
  return typeof value === 'string' ? value : 'unknown';
}
