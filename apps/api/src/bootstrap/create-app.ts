import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { assertEveryRouteHasPolicy } from '@sirius/auth-nest';
import { requestId } from '../http/request-id.js';
import { requestLogger } from '../http/request-logging.js';
import { corsPolicy, rateLimiter, securityHeaders } from '../http/security.js';
import { AppModule, type AppDependencies } from './app.module.js';
import { PinoNestLogger } from './nest-logger.js';
import { API_V1 } from './routes.js';

/**
 * Builds the HTTP application. Order matters: request ID first (so every log line and error
 * carries it), then request logging, security headers and CORS, then rate limiting on the API
 * before Nest's own middleware (authentication, then body parsing) and the global guard.
 * Start-up fails if any route lacks an access policy.
 */
export async function createApp(deps: AppDependencies): Promise<NestExpressApplication> {
  const { env, logger } = deps;
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(deps), {
    bodyParser: false,
    logger: new PinoNestLogger(logger),
  });

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('query parser', 'simple');

  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(securityHeaders());
  app.use(corsPolicy(env));
  app.use(`/${API_V1}`, rateLimiter(env));

  await app.init();
  assertEveryRouteHasPolicy(app);
  return app;
}
