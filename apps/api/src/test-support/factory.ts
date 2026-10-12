import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { pino, type Logger } from 'pino';
import { ApiErrorSchema, type ApiError } from '@sirius/shared-types';
import type { Principal } from '../auth/principal.js';
import type { AppDependencies } from '../bootstrap/app.module.js';
import { createApp } from '../bootstrap/create-app.js';
import { loadEnv, type Env } from '../config/env.js';

const tracked: INestApplication[] = [];

/** Apps created in a test are closed after it by test-setup.ts, so tests can't leak servers. */
export function track<T extends INestApplication>(app: T): T {
  tracked.push(app);
  return app;
}

export async function closeTrackedApps(): Promise<void> {
  const apps = tracked.splice(0);
  await Promise.all(apps.map((app) => app.close()));
}

/** Identity settings matching `createTestIssuer({ audience: TEST_AUDIENCE })` defaults. */
export const TEST_AUDIENCE = 'peopleforge-api';
export const TEST_TENANT = '00000000-0000-4000-8000-0000000000aa';
export const TEST_ISSUER = `https://login.example.test/${TEST_TENANT}/v2.0`;

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    APP_ENV: 'test',
    LOG_LEVEL: 'silent',
    OIDC_ISSUER: TEST_ISSUER,
    OIDC_AUDIENCE: TEST_AUDIENCE,
    OIDC_TENANT_ID: TEST_TENANT,
    ...overrides,
  });
}

export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}

type Resolver = AppDependencies['resolvePrincipal'];

/** Every request is made by this caller. */
export function resolveAs(principal: Principal): Resolver {
  return () => Promise.resolve(principal);
}

/** Every request is anonymous. */
export const anonymous: Resolver = () => Promise.resolve(null);

/** Parses a response body as the documented error shape, failing the test if it isn't. */
export function errorOf(response: { body: unknown }): ApiError['error'] {
  return ApiErrorSchema.parse(response.body).error;
}

export async function buildApp(
  overrides: Partial<AppDependencies> = {},
): Promise<NestExpressApplication> {
  return track(
    await createApp({
      env: testEnv(),
      logger: silentLogger(),
      resolvePrincipal: anonymous,
      readinessChecks: [],
      isShuttingDown: () => false,
      ...overrides,
    }),
  );
}
