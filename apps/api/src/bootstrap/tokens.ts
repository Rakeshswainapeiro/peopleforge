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
export const NOTIFICATION_SERVICE = Symbol('NOTIFICATION_SERVICE');
export const DASHBOARD_SERVICE = Symbol('DASHBOARD_SERVICE');
export const REVIEW_SERVICE = Symbol('REVIEW_SERVICE');
export const CONVERSATION_SERVICE = Symbol('CONVERSATION_SERVICE');
export const REPORT_SERVICE = Symbol('REPORT_SERVICE');
export const AUDIT_SERVICE = Symbol('AUDIT_SERVICE');
export const SETTINGS_SERVICE = Symbol('SETTINGS_SERVICE');
export const ANALYTICS_SERVICE = Symbol('ANALYTICS_SERVICE');
export const GROUP_DATA_SERVICE = Symbol('GROUP_DATA_SERVICE');
export const DATA_QUALITY_SERVICE = Symbol('DATA_QUALITY_SERVICE');
