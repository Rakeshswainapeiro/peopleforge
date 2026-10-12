import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { getRequestId } from './locals.js';
import { serializeRequest, serializeResponse } from './log-serializers.js';

export function logLevelFor(statusCode: number, error: unknown): 'error' | 'warn' | 'info' {
  if (error !== undefined || statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/** Orchestrator probes fire every few seconds; logging them would drown real traffic. */
export function isProbePath(url: string | undefined): boolean {
  return url?.startsWith('/health/') === true;
}

/** One structured line per request: method, path (no query), status, duration, request ID. */
export function requestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (_req, res) => getRequestId(res),
    customLogLevel: (_req, res, error) => logLevelFor(res.statusCode, error),
    autoLogging: { ignore: (req) => isProbePath(req.url) },
    serializers: { req: serializeRequest, res: serializeResponse },
  });
}
