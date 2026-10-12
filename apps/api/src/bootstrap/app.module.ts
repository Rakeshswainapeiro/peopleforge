import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, DiscoveryModule } from '@nestjs/core';
import type { Logger } from 'pino';
import { PolicyGuard } from '../auth/policy.guard.js';
import type { SessionResolver } from '../auth/session.js';
import type { Env } from '../config/env.js';
import { HealthController } from '../health/health.controller.js';
import type { ReadinessCheck } from '../health/readiness.js';
import { AuthenticateMiddleware } from '../http/authenticate.middleware.js';
import { ApiExceptionFilter } from '../http/exception.filter.js';
import { JsonBodyMiddleware } from '../http/json-body.middleware.js';
import { MeController } from '../modules/identity/me.controller.js';
import { API_V1 } from './routes.js';
import { ENV, LOGGER, READINESS_CHECKS, SESSION_RESOLVER, SHUTDOWN_STATE } from './tokens.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  sessionResolver: SessionResolver;
  readinessChecks: readonly ReadinessCheck[];
  isShuttingDown: () => boolean;
}

/**
 * Root module. Dependencies are passed in (not read from globals) so tests build the same
 * application with fakes. The policy guard and exception filter are global: no route can
 * opt out of either.
 */
@Module({})
export class AppModule implements NestModule {
  static register(deps: AppDependencies): DynamicModule {
    return {
      module: AppModule,
      imports: [DiscoveryModule],
      controllers: [HealthController, MeController],
      providers: [
        { provide: ENV, useValue: deps.env },
        { provide: LOGGER, useValue: deps.logger },
        { provide: SESSION_RESOLVER, useValue: deps.sessionResolver },
        { provide: READINESS_CHECKS, useValue: deps.readinessChecks },
        { provide: SHUTDOWN_STATE, useValue: { isShuttingDown: deps.isShuttingDown } },
        { provide: APP_GUARD, useClass: PolicyGuard },
        {
          provide: APP_FILTER,
          useFactory: (logger: Logger) => new ApiExceptionFilter(logger),
          inject: [LOGGER],
        },
      ],
    };
  }

  /** Authenticate first, then parse bodies, for everything under /api/v1 (deny by default). */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthenticateMiddleware, JsonBodyMiddleware)
      .forRoutes({ path: `${API_V1}/*path`, method: RequestMethod.ALL });
  }
}
