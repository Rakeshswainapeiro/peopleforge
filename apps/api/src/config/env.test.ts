import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults for optional settings', () => {
    const env = loadEnv({ APP_ENV: 'dev' });
    expect(env).toMatchObject({
      APP_ENV: 'dev',
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ALLOWED_ORIGINS: [],
      TRUST_PROXY_HOPS: 1,
      REQUEST_BODY_LIMIT_KB: 100,
    });
  });

  it('parses and normalises the CORS allow-list', () => {
    const env = loadEnv({
      APP_ENV: 'dev',
      CORS_ALLOWED_ORIGINS: ' http://localhost:3000/ , https://hr.example.ae ,',
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'https://hr.example.ae']);
  });

  it('fails fast listing only the invalid key names, never their values', () => {
    const attempt = () => loadEnv({ APP_ENV: 'staging', PORT: 'secret-value-99999' });
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
    expect(() => loadEnv({ APP_ENV: 'dev', CORS_ALLOWED_ORIGINS: 'javascript:alert(1)' })).toThrow(
      ConfigError,
    );
  });

  it.each(['uat', 'prod'])('requires a CORS allow-list in %s', (appEnv) => {
    expect(() => loadEnv({ APP_ENV: appEnv })).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it.each(['uat', 'prod'])('requires https origins in %s', (appEnv) => {
    expect(() =>
      loadEnv({ APP_ENV: appEnv, CORS_ALLOWED_ORIGINS: 'http://hr.example.ae' }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('accepts a valid production configuration', () => {
    const env = loadEnv({ APP_ENV: 'prod', CORS_ALLOWED_ORIGINS: 'https://hr.example.ae' });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['https://hr.example.ae']);
  });
});
