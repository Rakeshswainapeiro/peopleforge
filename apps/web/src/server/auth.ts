import { createSiriusAuthOptions, type SignInEvents } from '@sirius/auth-better';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';
import type { Logger } from 'pino';
import type { WebEnv } from './env';
import { serverEnv } from './env';
import { getLogger } from './logger';

/** App roles issued by the identity provider for PeopleForge (Entra app roles; Keycloak locally). */
export const ROLE_PREFIX = 'PeopleForge.';

/** Only people with a PeopleForge role get an account here (data minimisation, NFR-PRIV-01). */
export function hasPeopleForgeRole(roles: readonly string[]): boolean {
  return roles.some((role) => role.startsWith(ROLE_PREFIX));
}

/** Every sign-in, successful or not, as a structured log event — IDs and codes, no personal data. */
export function signInLogEvents(logger: Logger): SignInEvents {
  return {
    signedIn: ({ userId }) => {
      logger.info({ event: 'sign_in_succeeded', userId }, 'Signed in');
    },
    signInRejected: ({ reason }) => {
      logger.warn({ event: 'sign_in_rejected', reason }, 'Sign-in refused');
    },
    signInFailed: ({ code }) => {
      logger.warn({ event: 'sign_in_failed', code }, 'Sign-in failed');
    },
  };
}

/**
 * Sign-in for the web app (backend-for-frontend, ADR-003). Sessions and provider tokens live
 * in PostgreSQL schema `auth`; the browser only holds an HttpOnly session cookie. Every
 * sign-in, successful or not, is logged as a structured event (without personal data).
 */
export type Auth = ReturnType<typeof betterAuth<BetterAuthOptions>>;

export function createAuth(env: WebEnv, logger: Logger): Auth {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    options: '-c search_path=auth',
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });

  return betterAuth(
    createSiriusAuthOptions({
      appName: 'PeopleForge',
      cookiePrefix: 'peopleforge',
      baseURL: env.AUTH_URL,
      secret: env.AUTH_SECRET,
      database: pool,
      production: env.APP_ENV !== 'dev' && env.APP_ENV !== 'test',
      provider: {
        issuer: env.OIDC_ISSUER,
        clientId: env.OIDC_CLIENT_ID,
        clientSecret: env.OIDC_CLIENT_SECRET,
        tenantId: env.OIDC_TENANT_ID,
        scopes: env.OIDC_SCOPES,
      },
      hasAccess: hasPeopleForgeRole,
      signInPath: '/sign-in',
      events: signInLogEvents(logger),
      // Lets Server Actions set the session cookie.
      plugins: [nextCookies()],
    }),
  );
}

let auth: Auth | undefined;

export function getAuth(): Auth {
  auth ??= createAuth(serverEnv(), getLogger());
  return auth;
}
