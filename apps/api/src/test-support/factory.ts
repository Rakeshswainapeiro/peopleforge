import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { pino, type Logger } from 'pino';
import { ApiErrorSchema, type ApiError } from '@sirius-hr/shared-types';
import type { Principal } from '../auth/principal.js';
import { unconfiguredSessionResolver, type SessionResolver } from '../auth/session.js';
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

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({ APP_ENV: 'test', LOG_LEVEL: 'silent', ...overrides });
}

export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}

export function resolveAs(principal: Principal): SessionResolver {
  return () => Promise.resolve(principal);
}

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
      sessionResolver: unconfiguredSessionResolver,
      readinessChecks: [],
      isShuttingDown: () => false,
      ...overrides,
    }),
  );
}
