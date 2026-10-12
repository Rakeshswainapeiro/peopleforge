import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { authenticate, type SessionResolver } from './auth/authenticate.js';
import type { Env } from './config/env.js';
import { healthRouter } from './health/health.routes.js';
import type { ReadinessCheck } from './health/readiness.js';
import { createErrorHandler, notFoundHandler } from './http/error-handler.js';
import { getRequestId } from './http/locals.js';
import { serializeRequest, serializeResponse } from './http/log-serializers.js';
import { requestId } from './http/request-id.js';
import { corsPolicy, rateLimiter, securityHeaders } from './http/security.js';
import { meRouter } from './modules/identity/me.routes.js';

export function logLevelFor(statusCode: number, error: unknown): 'error' | 'warn' | 'info' {
  if (error !== undefined || statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/** Orchestrator probes fire every few seconds; logging them would drown real traffic. */
export function isProbePath(url: string | undefined): boolean {
  return url?.startsWith('/health/') === true;
}

export interface AppDependencies {
  env: Env;
  logger: Logger;
  sessionResolver: SessionResolver;
  readinessChecks: readonly ReadinessCheck[];
  isShuttingDown: () => boolean;
}

/**
 * Composition root for HTTP. Middleware order matters: request ID first (so every log line and
 * error carries it), security headers and CORS before any handler, rate limiting before body
 * parsing, and authentication in front of the whole /api/v1 surface (deny by default).
 */
export function createApp(deps: AppDependencies): Express {
  const { env, logger } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('query parser', 'simple');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => getRequestId(res),
      customLogLevel: (_req, res, error) => logLevelFor(res.statusCode, error),
      autoLogging: { ignore: (req) => isProbePath(req.url) },
      serializers: { req: serializeRequest, res: serializeResponse },
    }),
  );
  app.use(securityHeaders());
  app.use(corsPolicy(env));

  app.use(
    '/health',
    healthRouter({
      checks: deps.readinessChecks,
      timeoutMs: env.READINESS_CHECK_TIMEOUT_MS,
      isShuttingDown: deps.isShuttingDown,
    }),
  );

  const v1 = express.Router();
  v1.use(rateLimiter(env));
  // Authenticate before parsing bodies so anonymous callers can't make us buffer payloads.
  v1.use(authenticate(deps.sessionResolver));
  v1.use(express.json({ limit: `${String(env.REQUEST_BODY_LIMIT_KB)}kb`, strict: true }));
  v1.use(meRouter());
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
