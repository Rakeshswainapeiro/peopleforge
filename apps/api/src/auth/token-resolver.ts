import { bearerTokenResolver } from '@sirius/auth-nest';
import type { AccessTokenVerifier } from '@sirius/identity';
import type { IncomingMessage } from 'node:http';
import type { Logger } from 'pino';
import { principalFromIdentity, type Principal } from './principal.js';

/**
 * Resolves the caller from `Authorization: Bearer <access token>` (Entra ID in production,
 * Keycloak locally). Refusal reasons are logged for diagnosis; tokens and claims never are.
 */
export function tokenResolver(deps: {
  verifier: AccessTokenVerifier;
  logger: Logger;
}): (request: IncomingMessage) => Promise<Principal | null> {
  return bearerTokenResolver({
    verifier: deps.verifier,
    toPrincipal: principalFromIdentity,
    onRejected: (reason) => {
      deps.logger.warn({ reason }, 'Access token rejected');
    },
  });
}
