import cors from 'cors';
import type { RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { messageKeyFor, type ApiError } from '@sirius/shared-types';
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
 * Who a request counts against: the caller's access token (one budget per signed-in session),
 * else the client IP (IPv6 by /56 block, so one host can't rotate addresses). Only a SHA-256
 * of the token is kept, never the token.
 */
export function callerKey(authorization: string | undefined, ip: string | undefined): string {
  if (authorization !== undefined && authorization.trim() !== '') {
    return `token:${createHash('sha256').update(authorization).digest('base64url')}`;
  }
  return `ip:${ipKeyGenerator(ip ?? '')}`;
}

function limiter(windowMs: number, limit: number, key: RequestHandlerKey): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: key,
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

type RequestHandlerKey = (req: Parameters<RequestHandler>[0]) => string;

/**
 * Two limits on /api/v1. Every user reaches the API through the web server, so a per-IP limit
 * alone would make all users share one budget: each caller (token) gets RATE_LIMIT_MAX per
 * window, and each IP a higher ceiling, RATE_LIMIT_IP_MAX, against floods and made-up tokens.
 * In-memory stores are correct for a single instance only; a shared Redis store is required
 * before running more than one API replica (see DEPLOYMENT.md, Scaling).
 */
export function rateLimiter(env: Env): RequestHandler[] {
  return [
    limiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_IP_MAX, (req) => callerKey(undefined, req.ip)),
    limiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX, (req) =>
      callerKey(req.headers.authorization, req.ip),
    ),
  ];
}
