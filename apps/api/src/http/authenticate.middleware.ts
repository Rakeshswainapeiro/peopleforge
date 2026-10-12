import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { SessionResolver } from '../auth/session.js';
import { SESSION_RESOLVER } from '../bootstrap/tokens.js';
import { UnauthenticatedError } from '../errors/domain-errors.js';
import { setPrincipal } from './locals.js';

/**
 * Runs for every /api/v1 request, including unknown paths, so unauthenticated callers learn
 * nothing about which routes exist. It runs before body parsing so anonymous callers can't
 * make the server buffer payloads.
 */
@Injectable()
export class AuthenticateMiddleware implements NestMiddleware {
  constructor(@Inject(SESSION_RESOLVER) private readonly resolve: SessionResolver) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const principal = await this.resolve(req);
    if (principal === null) {
      throw new UnauthenticatedError('Authentication required');
    }
    setPrincipal(res, principal);
    next();
  }
}
