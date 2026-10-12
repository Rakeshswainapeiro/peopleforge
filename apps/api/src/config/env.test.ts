import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from './env.js';

const IDENTITY = {
  OIDC_ISSUER: 'https://login.microsoftonline.com/tenant-id/v2.0',
  OIDC_AUDIENCE: 'api://peopleforge',
  OIDC_TENANT_ID: 'tenant-id',
};
const LOCAL_IDENTITY = {
  OIDC_ISSUER: 'http://keycloak.sirius.test:8180/realms/sirius',
  OIDC_AUDIENCE: 'peopleforge-api',
  OIDC_TENANT_ID: 'tenant-id',
  OIDC_ALLOW_HTTP: 'true',
};

describe('loadEnv', () => {
  it('applies defaults for optional settings', () => {
    const env = loadEnv({ APP_ENV: 'dev', ...IDENTITY });
    expect(env).toMatchObject({
      APP_ENV: 'dev',
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ALLOWED_ORIGINS: [],
      TRUST_PROXY_HOPS: 1,
      REQUEST_BODY_LIMIT_KB: 100,
      OIDC_ALLOW_HTTP: false,
      OIDC_TIMEOUT_MS: 5000,
    });
  });

  it('parses and normalises the CORS allow-list', () => {
    const env = loadEnv({
      APP_ENV: 'dev',
      ...IDENTITY,
      CORS_ALLOWED_ORIGINS: ' http://localhost:3000/ , https://hr.example.ae ,',
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'https://hr.example.ae']);
  });

  it('fails fast listing only the invalid key names, never their values', () => {
    const attempt = () => loadEnv({ APP_ENV: 'staging', ...IDENTITY, PORT: 'secret-value-99999' });
    expect(attempt).toThrow(ConfigError);
    try {
      attempt();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigError);
      const configError = error as ConfigError;
      expect(configError.invalidKeys).toEqual(['APP_ENV', 'PORT']);
      expect(configError.message).not.toContain('secret-value');
    }
  });

  it('rejects non-http origins', () => {
    expect(() =>
      loadEnv({ APP_ENV: 'dev', ...IDENTITY, CORS_ALLOWED_ORIGINS: 'javascript:alert(1)' }),
    ).toThrow(ConfigError);
  });

  it.each(['uat', 'prod'])('requires a CORS allow-list in %s', (appEnv) => {
    expect(() => loadEnv({ APP_ENV: appEnv, ...IDENTITY })).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it.each(['uat', 'prod'])('requires https origins in %s', (appEnv) => {
    expect(() =>
      loadEnv({ APP_ENV: appEnv, ...IDENTITY, CORS_ALLOWED_ORIGINS: 'http://hr.example.ae' }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('accepts a valid production configuration', () => {
    const env = loadEnv({
      APP_ENV: 'prod',
      ...IDENTITY,
      CORS_ALLOWED_ORIGINS: 'https://hr.example.ae',
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['https://hr.example.ae']);
  });

  it('requires the identity provider settings', () => {
    expect(() => loadEnv({ APP_ENV: 'dev' })).toThrow(
      'Invalid or missing environment variables: OIDC_AUDIENCE, OIDC_ISSUER, OIDC_TENANT_ID',
    );
  });

  it('accepts the local Keycloak over plain HTTP in dev', () => {
    const env = loadEnv({ APP_ENV: 'dev', ...LOCAL_IDENTITY });
    expect(env.OIDC_ALLOW_HTTP).toBe(true);
  });

  it.each(['uat', 'prod'])('refuses a plain-HTTP identity provider in %s', (appEnv) => {
    const origins = { CORS_ALLOWED_ORIGINS: 'https://hr.example.ae' };
    expect(() => loadEnv({ APP_ENV: appEnv, ...LOCAL_IDENTITY, ...origins })).toThrow(
      /OIDC_ISSUER/,
    );
    expect(() =>
      loadEnv({ APP_ENV: appEnv, ...IDENTITY, OIDC_ALLOW_HTTP: 'true', ...origins }),
    ).toThrow(/OIDC_ISSUER/);
  });
});
