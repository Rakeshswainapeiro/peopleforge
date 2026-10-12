import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { Env } from '../config/env.js';
import { ENV } from '../bootstrap/tokens.js';

/**
 * Strict JSON body parsing with a size limit. Wrapped in a promise so parser failures
 * (malformed JSON, payload too large) are thrown into Nest's exception filter and get the
 * standard error shape, instead of reaching Express's default error page.
 */
@Injectable()
export class JsonBodyMiddleware implements NestMiddleware {
  private readonly parser: RequestHandler;

  constructor(@Inject(ENV) env: Env) {
    this.parser = express.json({ limit: `${String(env.REQUEST_BODY_LIMIT_KB)}kb`, strict: true });
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      void this.parser(req, res, (error?: unknown) => {
        if (error === undefined) resolve();
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- body-parser only passes http-errors instances (Error subclasses)
        else reject(error);
      });
    });
    next();
  }
}
