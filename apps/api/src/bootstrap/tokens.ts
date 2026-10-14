/**
 * Injection tokens. Every dependency is injected explicitly with @Inject(TOKEN) instead of by
 * constructor type, so dependency injection never relies on emitted type metadata (which
 * type-only imports and some test transforms silently drop).
 */
export const ENV = Symbol('ENV');
export const LOGGER = Symbol('LOGGER');
export const READINESS_CHECKS = Symbol('READINESS_CHECKS');
export const SHUTDOWN_STATE = Symbol('SHUTDOWN_STATE');

export interface ShutdownState {
  isShuttingDown: () => boolean;
}

export const ENTITY_DIRECTORY = Symbol('ENTITY_DIRECTORY');
export const INCREMENT_REQUEST_SERVICE = Symbol('INCREMENT_REQUEST_SERVICE');
export const EVIDENCE_SERVICE = Symbol('EVIDENCE_SERVICE');
