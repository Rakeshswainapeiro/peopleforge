import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { setRequestId } from './locals.js';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept an upstream ID (gateway/web tier) only if it is short and log-safe; otherwise mint one
// so attackers can't inject newlines or huge values into logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  setRequestId(res, id);
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
