import type { Response } from 'express';
import type { Principal } from '../auth/principal.js';

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

export function setPrincipal(res: Response, principal: Principal): void {
  res.locals.principal = principal;
}

export function getPrincipal(res: Response): Principal | undefined {
  const value: unknown = res.locals.principal;
  return value instanceof Object ? (value as Principal) : undefined;
}
