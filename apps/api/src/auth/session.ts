import type { Request } from 'express';
import type { Principal } from './principal.js';

/**
 * Resolves the caller from the request (session cookie or bearer token). The real resolver
 * validates identity-provider tokens and is added with sign-in.
 */
export type SessionResolver = (req: Request) => Promise<Principal | null>;

/**
 * Deny-by-default stand-in until sign-in is wired: every /api/v1 request is unauthenticated,
 * so nothing is reachable by accident in any environment.
 */
export const unconfiguredSessionResolver: SessionResolver = () => Promise.resolve(null);
