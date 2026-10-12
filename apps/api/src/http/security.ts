import cors from 'cors';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { messageKeyFor, type ApiError } from '@sirius-hr/shared-types';
import type { Env } from '../config/env.js';
import { getRequestId } from './locals.js';

/** The API serves JSON only, so the CSP denies everything and framing is forbidden. */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
}

/** Explicit allow-list; requests from any other browser origin get no CORS headers. */
export function corsPolicy(env: Env): RequestHandler {
  const allowed = new Set(env.CORS_ALLOWED_ORIGINS);
  return cors({
    origin: (requestOrigin, callback) => {
      callback(null, requestOrigin !== undefined && allowed.has(requestOrigin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
}

/**
 * Per-IP limiter. In-memory store is correct for a single instance only; a shared Redis store
 * is required before running more than one API replica (see DEPLOYMENT.md, Scaling).
 */
export function rateLimiter(env: Env): RequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiError = {
        error: {
          code: 'RATE_LIMITED',
          messageKey: messageKeyFor('RATE_LIMITED'),
          requestId: getRequestId(res),
        },
      };
      res.status(429).json(body);
    },
  });
}
