import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from './env.js';

const DEV = {
  APP_ENV: 'dev',
  WORKER_DATABASE_URL: 'postgres://peopleforge_worker:x@localhost:55432/peopleforge',
  PORTAL_URL: 'http://localhost:3000',
  EMAIL_TRANSPORT: 'smtp',
  EMAIL_FROM: 'no-reply@peopleforge.local',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_REQUIRE_TLS: 'false',
};

const PROD = {
  ...DEV,
  APP_ENV: 'prod',
  PORTAL_URL: 'https://hr.example.ae',
  SMTP_HOST: 'smtp.example.ae',
  SMTP_PORT: '587',
  SMTP_REQUIRE_TLS: 'true',
  SMTP_USER: 'peopleforge',
  SMTP_PASSWORD: 'from-the-vault',
};

function invalidKeys(source: Record<string, string>): readonly string[] {
  try {
    loadEnv(source);
  } catch (error: unknown) {
    if (error instanceof ConfigError) return error.invalidKeys;
    throw error;
  }
  return [];
}

describe('loadEnv', () => {
  it('reads the development settings with defaults', () => {
    expect(loadEnv(DEV)).toMatchObject({
      HEALTH_PORT: 4200,
      DATABASE_POOL_MAX: 4,
      OUTBOX_POLL_MS: 5_000,
      OUTBOX_BATCH_SIZE: 10,
      OUTBOX_MAX_ATTEMPTS: 6,
      OUTBOX_LEASE_MS: 300_000,
      OUTBOX_ALERT_AFTER_S: 900,
      SMTP_REQUIRE_TLS: false,
    });
    expect(invalidKeys(PROD)).toEqual([]);
  });

  it('names missing or invalid keys, never their values', () => {
    const error = (() => {
      try {
        loadEnv({ ...DEV, WORKER_DATABASE_URL: 'mysql://secret-host', PORTAL_URL: '' });
      } catch (caught: unknown) {
        return caught as Error;
      }
      return new Error('none');
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain('WORKER_DATABASE_URL');
    expect(error.message).not.toContain('secret-host');
  });

  it('keeps the lease longer than a batch of timeouts', () => {
    expect(invalidKeys({ ...DEV, OUTBOX_LEASE_MS: '60000', OUTBOX_BATCH_SIZE: '10' })).toEqual([
      'OUTBOX_LEASE_MS',
    ]);
  });

  it('refuses files, plain SMTP and plain-HTTP links in UAT and production', () => {
    expect(
      invalidKeys({
        ...PROD,
        APP_ENV: 'uat',
        EMAIL_TRANSPORT: 'file',
        EMAIL_FILE_DIR: '/tmp/mail',
        SMTP_REQUIRE_TLS: 'false',
        PORTAL_URL: 'http://hr.example.ae',
      }),
    ).toEqual(['EMAIL_TRANSPORT', 'SMTP_REQUIRE_TLS', 'PORTAL_URL']);
  });
});
