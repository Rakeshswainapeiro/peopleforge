import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWebEnv } from './env';

const ENV = loadWebEnv({
  APP_ENV: 'dev',
  AUTH_SECRET: 'x'.repeat(40),
  AUTH_URL: 'http://localhost:3000',
  OIDC_ISSUER: 'http://127.0.0.1:1/realms/sirius',
  OIDC_TENANT_ID: 'tenant-1',
  OIDC_ALLOW_HTTP: 'true',
  OIDC_CLIENT_ID: 'peopleforge-web',
  OIDC_CLIENT_SECRET: 'secret',
  DATABASE_URL: 'postgres://peopleforge_app:pw@127.0.0.1:1/peopleforge',
  PEOPLEFORGE_API_URL: 'http://localhost:4000',
});

beforeEach(() => {
  // Better Auth starts provider discovery and a schema check on creation; neither server
  // exists in unit tests, so its expected connection errors are silenced here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./env');
  vi.doUnmock('./logger');
});

describe('hasPeopleForgeRole', () => {
  it('admits only people holding a PeopleForge app role', async () => {
    const { hasPeopleForgeRole } = await import('./auth');
    expect(hasPeopleForgeRole(['PeopleForge.SubsidiaryHR'])).toBe(true);
    expect(hasPeopleForgeRole(['DealForge.CIO', 'PeopleForge.Admin'])).toBe(true);
    expect(hasPeopleForgeRole(['DealForge.CIO'])).toBe(false);
    expect(hasPeopleForgeRole([])).toBe(false);
  });
});

describe('createAuth', () => {
  it('uses the shared Sirius settings with PeopleForge cookies and secure-only cookies outside dev', async () => {
    const { createAuth } = await import('./auth');
    const local = createAuth(ENV, pino({ level: 'silent' }));
    expect(local.options).toMatchObject({
      appName: 'PeopleForge',
      baseURL: 'http://localhost:3000',
      emailAndPassword: { enabled: false },
      advanced: { cookiePrefix: 'peopleforge', useSecureCookies: false },
    });
    const uat = createAuth({ ...ENV, APP_ENV: 'uat' }, pino({ level: 'silent' }));
    expect(uat.options.advanced).toMatchObject({ useSecureCookies: true });
  });
});

describe('signInLogEvents', () => {
  it('logs outcomes with IDs and codes only', async () => {
    const { signInLogEvents } = await import('./auth');
    const logger = pino({ level: 'silent' });
    const info = vi.spyOn(logger, 'info');
    const warn = vi.spyOn(logger, 'warn');
    const events = signInLogEvents(logger);
    events.signedIn?.({ userId: 'u-1' });
    events.signInRejected?.({ reason: 'no_app_role' });
    events.signInFailed?.({ code: 'access_denied' });
    expect(info).toHaveBeenCalledWith({ event: 'sign_in_succeeded', userId: 'u-1' }, 'Signed in');
    expect(warn).toHaveBeenCalledWith(
      { event: 'sign_in_rejected', reason: 'no_app_role' },
      'Sign-in refused',
    );
    expect(warn).toHaveBeenCalledWith(
      { event: 'sign_in_failed', code: 'access_denied' },
      'Sign-in failed',
    );
  });
});

describe('getAuth', () => {
  it('builds the instance once from the server environment', async () => {
    vi.doMock('./env', () => ({ serverEnv: () => ENV }));
    vi.doMock('./logger', () => ({ getLogger: () => pino({ level: 'silent' }) }));
    const { getAuth } = await import('./auth');
    expect(getAuth()).toBe(getAuth());
  });
});
