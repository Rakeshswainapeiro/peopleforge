import { afterEach, describe, expect, it, vi } from 'vitest';

const LOCAL = {
  APP_ENV: 'dev',
  AUTH_SECRET: 'x'.repeat(40),
  AUTH_URL: 'http://localhost:3000',
  OIDC_ISSUER: 'http://keycloak.sirius.test:8180/realms/sirius',
  OIDC_TENANT_ID: 'tenant-1',
  OIDC_ALLOW_HTTP: 'true',
  OIDC_CLIENT_ID: 'peopleforge-web',
  OIDC_CLIENT_SECRET: 'secret-value',
  DATABASE_URL: 'postgres://peopleforge_app:pw@localhost:55432/peopleforge',
  PEOPLEFORGE_API_URL: 'http://localhost:4000/',
};
const PROD = {
  ...LOCAL,
  APP_ENV: 'prod',
  AUTH_URL: 'https://peopleforge.sirius.ae',
  OIDC_ISSUER: 'https://login.microsoftonline.com/tenant-1/v2.0',
  OIDC_ALLOW_HTTP: 'false',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('loadWebEnv', () => {
  it('accepts the local development settings with defaults', async () => {
    const { loadWebEnv } = await import('./env');
    expect(loadWebEnv(LOCAL)).toMatchObject({
      LOG_LEVEL: 'info',
      DATABASE_POOL_MAX: 10,
      PEOPLEFORGE_API_URL: 'http://localhost:4000',
      PEOPLEFORGE_API_TIMEOUT_MS: 5000,
      OIDC_SCOPES: ['openid', 'profile', 'email'],
    });
  });

  it('accepts a production configuration over HTTPS', async () => {
    const { loadWebEnv } = await import('./env');
    expect(loadWebEnv(PROD).APP_ENV).toBe('prod');
  });

  it.each(['uat', 'prod'])('refuses plain HTTP for sign-in in %s', async (appEnv) => {
    const { loadWebEnv } = await import('./env');
    expect(() =>
      loadWebEnv({ ...PROD, APP_ENV: appEnv, AUTH_URL: 'http://peopleforge.sirius.ae' }),
    ).toThrow('AUTH_URL');
    expect(() => loadWebEnv({ ...PROD, APP_ENV: appEnv, OIDC_ALLOW_HTTP: 'true' })).toThrow(
      'OIDC_ISSUER',
    );
    expect(() =>
      loadWebEnv({ ...PROD, APP_ENV: appEnv, OIDC_ISSUER: 'http://idp.sirius.ae/realms/x' }),
    ).toThrow('OIDC_ISSUER');
  });

  it('names invalid keys without echoing secret values', async () => {
    const { loadWebEnv, WebConfigError } = await import('./env');
    const attempt = () =>
      loadWebEnv({ ...LOCAL, AUTH_SECRET: 'too-short-secret', DATABASE_URL: 'mysql://x' });
    expect(attempt).toThrow(WebConfigError);
    expect(attempt).toThrow('Invalid or missing environment variables: AUTH_SECRET, DATABASE_URL');
    expect(attempt).not.toThrow(/too-short-secret/);
  });

  it('validates process.env once, on first use', async () => {
    for (const [key, value] of Object.entries(LOCAL)) vi.stubEnv(key, value);
    const { serverEnv } = await import('./env');
    const first = serverEnv();
    vi.stubEnv('AUTH_URL', 'not a url');
    expect(serverEnv()).toBe(first);
  });
});
