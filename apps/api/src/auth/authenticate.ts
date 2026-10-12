import type { NextFunction, Request, Response } from 'express';
import { UnauthenticatedError } from '../errors/domain-errors.js';
import { setPrincipal } from '../http/locals.js';
import type { Principal } from './principal.js';

/**
 * Resolves the caller from the request (session cookie or bearer token). The real resolver
 * depends on the identity provider, which is pending Sirius IT (assumption A6).
 */
export type SessionResolver = (req: Request) => Promise<Principal | null>;

/**
 * Deny-by-default stand-in until OIDC is wired: every /api/v1 request is unauthenticated, so
 * nothing is reachable by accident in any environment.
 */
export const unconfiguredSessionResolver: SessionResolver = () => Promise.resolve(null);

export function authenticate(resolve: SessionResolver) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principal = await resolve(req);
    if (principal === null) {
      throw new UnauthenticatedError('Authentication required');
    }
    setPrincipal(res, principal);
    next();
  };
}
