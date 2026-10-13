import type { EntityDirectory } from '@peopleforge/db';
import { bearerTokenResolver } from '@sirius/auth-nest';
import type { AccessTokenVerifier } from '@sirius/identity';
import type { IncomingMessage } from 'node:http';
import type { Logger } from 'pino';
import { DependencyUnavailableError } from '../errors/domain-errors.js';
import { hasGroupRole, principalFromIdentity, type Principal } from './principal.js';

/**
 * Resolves the caller from `Authorization: Bearer <access token>` (Entra ID in production,
 * Keycloak locally), then their subsidiaries from core.user_entity (R1-01, R2-12). Group roles
 * skip the lookup. Refusal reasons are logged for diagnosis; tokens and claims never are.
 */
export function tokenResolver(deps: {
  verifier: AccessTokenVerifier;
  logger: Logger;
  directory: Pick<EntityDirectory, 'assignedEntityIds'>;
}): (request: IncomingMessage) => Promise<Principal | null> {
  return bearerTokenResolver({
    verifier: deps.verifier,
    toPrincipal: async (identity) => {
      if (hasGroupRole(identity.roles)) return principalFromIdentity(identity, []);
      try {
        return principalFromIdentity(
          identity,
          await deps.directory.assignedEntityIds(identity.subject),
        );
      } catch (error: unknown) {
        // Fail closed with 503 (retry later); never fall back to an unscoped principal.
        deps.logger.error({ errorName: errorName(error) }, 'Entity assignments unavailable');
        throw new DependencyUnavailableError('Entity assignments unavailable');
      }
    },
    onRejected: (reason) => {
      deps.logger.warn({ reason }, 'Access token rejected');
    },
  });
}

/** Error class only: driver messages can echo query fragments, which must not reach logs. */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}
