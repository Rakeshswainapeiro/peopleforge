import type { Express } from 'express';
import { pino, type Logger } from 'pino';
import { ApiErrorSchema, type ApiError } from '@sirius-hr/shared-types';
import { createApp, type AppDependencies } from '../app.js';
import { unconfiguredSessionResolver } from '../auth/authenticate.js';
import { loadEnv, type Env } from '../config/env.js';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({ APP_ENV: 'test', LOG_LEVEL: 'silent', ...overrides });
}

export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}

/** Parses a response body as the documented error shape, failing the test if it isn't. */
export function errorOf(response: { body: unknown }): ApiError['error'] {
  return ApiErrorSchema.parse(response.body).error;
}

export function buildApp(overrides: Partial<AppDependencies> = {}): Express {
  return createApp({
    env: testEnv(),
    logger: silentLogger(),
    sessionResolver: unconfiguredSessionResolver,
    readinessChecks: [],
    isShuttingDown: () => false,
    ...overrides,
  });
}
