import { describe, expect, it } from 'vitest';
import { cipherFromEnv, ConfigError, loadEnv } from './env.js';

const IDENTITY = {
  OIDC_ISSUER: 'https://login.microsoftonline.com/tenant-id/v2.0',
  OIDC_AUDIENCE: 'api://peopleforge',
  OIDC_TENANT_ID: 'tenant-id',
};
const KEY = Buffer.alloc(32, 1).toString('base64');
const DATABASE = {
  DATABASE_URL: 'postgres://peopleforge_app:pw@db.internal:5432/peopleforge',
  DATA_ENCRYPTION_KEYS: `k1:${KEY}`,
  DATA_ENCRYPTION_ACTIVE_KEY: 'k1',
};
const FILES = {
  OBJECT_STORE_DRIVER: 's3',
  S3_REGION: 'me-central-1',
  S3_BUCKET: 'peopleforge-evidence',
  S3_ACCESS_KEY_ID: 'id',
  S3_SECRET_ACCESS_KEY: 'secret',
  MALWARE_SCANNER: 'clamav',
  CLAMAV_HOST: 'clamd.internal',
};
const LOCAL_IDENTITY = {
  OIDC_ISSUER: 'http://keycloak.sirius.test:8180/realms/sirius',
  OIDC_AUDIENCE: 'peopleforge-api',
  OIDC_TENANT_ID: 'tenant-id',
  OIDC_ALLOW_HTTP: 'true',
};

describe('loadEnv', () => {
  it('requires evidence storage and scanning settings [R1-04]', () => {
    expect(() => loadEnv({ APP_ENV: 'dev', ...IDENTITY, ...DATABASE })).toThrow(
      'Invalid or missing environment variables: MALWARE_SCANNER, OBJECT_STORE_DRIVER',
    );
    expect(() =>
      loadEnv({ APP_ENV: 'dev', ...IDENTITY, ...DATABASE, ...FILES, CLAMAV_HOST: undefined }),
    ).toThrow('Invalid or missing environment variables: CLAMAV_HOST');
  });

  it.each(['uat', 'prod'])('refuses local-disk storage and unscanned uploads in %s', (appEnv) => {
    expect(() =>
      loadEnv({
        APP_ENV: appEnv,
        ...IDENTITY,
        ...DATABASE,
        CORS_ALLOWED_ORIGINS: 'https://hr.example.ae',
        OBJECT_STORE_DRIVER: 'filesystem',
        OBJECT_STORE_DIR: '/var/lib/peopleforge',
        MALWARE_SCANNER: 'none',
      }),
    ).toThrow('Invalid or missing environment variables: MALWARE_SCANNER, OBJECT_STORE_DRIVER');
  });

  it('applies defaults for optional settings', () => {
    const env = loadEnv({ APP_ENV: 'dev', ...IDENTITY, ...DATABASE, ...FILES });
    expect(env).toMatchObject({
      APP_ENV: 'dev',
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ALLOWED_ORIGINS: [],
      TRUST_PROXY_HOPS: 1,
      REQUEST_BODY_LIMIT_KB: 100,
      OIDC_ALLOW_HTTP: false,
      OIDC_TIMEOUT_MS: 5000,
      DATABASE_POOL_MAX: 10,
    });
  });

  it('accepts only a PostgreSQL database URL [ADR-002]', () => {
    expect(() =>
      loadEnv({ APP_ENV: 'dev', ...IDENTITY, DATABASE_URL: 'mysql://db.internal/peopleforge' }),
    ).toThrow('Invalid or missing environment variables: DATABASE_URL');
  });

  it('parses and normalises the CORS allow-list', () => {
    const env = loadEnv({
      APP_ENV: 'dev',
      ...IDENTITY,
      ...DATABASE,
      ...FILES,
      CORS_ALLOWED_ORIGINS: ' http://localhost:3000/ , https://hr.example.ae ,',
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'https://hr.example.ae']);
  });

  it('fails fast listing only the invalid key names, never their values', () => {
    const attempt = () =>
      loadEnv({
        APP_ENV: 'staging',
        ...IDENTITY,
        ...DATABASE,
        ...FILES,
        PORT: 'secret-value-99999',
      });
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
      loadEnv({
        APP_ENV: 'dev',
        ...IDENTITY,
        ...DATABASE,
        ...FILES,
        CORS_ALLOWED_ORIGINS: 'javascript:alert(1)',
      }),
    ).toThrow(ConfigError);
  });

  it.each(['uat', 'prod'])('requires a CORS allow-list in %s', (appEnv) => {
    expect(() => loadEnv({ APP_ENV: appEnv, ...IDENTITY, ...DATABASE, ...FILES })).toThrow(
      /CORS_ALLOWED_ORIGINS/,
    );
  });

  it.each(['uat', 'prod'])('requires https origins in %s', (appEnv) => {
    expect(() =>
      loadEnv({
        APP_ENV: appEnv,
        ...IDENTITY,
        ...DATABASE,
        ...FILES,
        CORS_ALLOWED_ORIGINS: 'http://hr.example.ae',
      }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('accepts a valid production configuration', () => {
    const env = loadEnv({
      APP_ENV: 'prod',
      ...IDENTITY,
      ...DATABASE,
      ...FILES,
      CORS_ALLOWED_ORIGINS: 'https://hr.example.ae',
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['https://hr.example.ae']);
  });

  it('requires the identity provider settings', () => {
    expect(() => loadEnv({ APP_ENV: 'dev', ...FILES })).toThrow(
      'Invalid or missing environment variables: DATABASE_URL, DATA_ENCRYPTION_ACTIVE_KEY, DATA_ENCRYPTION_KEYS, OIDC_AUDIENCE, OIDC_ISSUER, OIDC_TENANT_ID',
    );
  });

  it('accepts the local Keycloak over plain HTTP in dev', () => {
    const env = loadEnv({ APP_ENV: 'dev', ...LOCAL_IDENTITY, ...DATABASE, ...FILES });
    expect(env.OIDC_ALLOW_HTTP).toBe(true);
  });

  it.each(['uat', 'prod'])('refuses a plain-HTTP identity provider in %s', (appEnv) => {
    const origins = { CORS_ALLOWED_ORIGINS: 'https://hr.example.ae' };
    expect(() =>
      loadEnv({ APP_ENV: appEnv, ...LOCAL_IDENTITY, ...DATABASE, ...FILES, ...origins }),
    ).toThrow(/OIDC_ISSUER/);
    expect(() =>
      loadEnv({
        APP_ENV: appEnv,
        ...IDENTITY,
        ...DATABASE,
        ...FILES,
        OIDC_ALLOW_HTTP: 'true',
        ...origins,
      }),
    ).toThrow(/OIDC_ISSUER/);
  });
});

describe('cipherFromEnv [ADR-008]', () => {
  it('builds the salary cipher from the key ring', () => {
    const cipher = cipherFromEnv(DATABASE);
    const context = { table: 't', column: 'c', rowId: 'r' };
    expect(cipher.decrypt(cipher.encrypt('21500.00', context), context)).toBe('21500.00');
  });

  it.each([
    [
      'a short key',
      { DATA_ENCRYPTION_KEYS: 'k1:c2hvcnQ=', DATA_ENCRYPTION_ACTIVE_KEY: 'k1' },
      'Key k1 must be 32 bytes',
    ],
    [
      'a missing active key',
      { DATA_ENCRYPTION_KEYS: `k1:${KEY}`, DATA_ENCRYPTION_ACTIVE_KEY: 'k2' },
      'Active key is not in the key ring',
    ],
  ])('refuses %s, naming the problem but never the key', (_label, env, problem) => {
    expect(() => cipherFromEnv(env)).toThrow(
      new ConfigError([`DATA_ENCRYPTION_KEYS (${problem})`]),
    );
    expect(() => cipherFromEnv(env)).not.toThrow(KEY);
  });
});
