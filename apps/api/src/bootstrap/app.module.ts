import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthenticateMiddleware, SiriusAuthModule } from '@sirius/auth-nest';
import type { IncomingMessage } from 'node:http';
import type { Logger } from 'pino';
import { permissionsOfPrincipal, type Principal } from '../auth/principal.js';
import type { Env } from '../config/env.js';
import { HealthController } from '../health/health.controller.js';
import type { ReadinessCheck } from '../health/readiness.js';
import { ApiExceptionFilter } from '../http/exception.filter.js';
import { JsonBodyMiddleware } from '../http/json-body.middleware.js';
import { MeController } from '../modules/identity/me.controller.js';
import { API_V1 } from './routes.js';
import { ENV, LOGGER, READINESS_CHECKS, SHUTDOWN_STATE } from './tokens.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  /**
   * Who is calling: null for anonymous (401). Production uses the bearer-token resolver
   * (main.ts); tests inject fixed principals or a resolver backed by a test issuer.
   */
  resolvePrincipal: (request: IncomingMessage) => Promise<Principal | null>;
  readinessChecks: readonly ReadinessCheck[];
  isShuttingDown: () => boolean;
}

/**
 * Root module. Dependencies are passed in (not read from globals) so tests build the same
 * application with fakes. The policy guard (from @sirius/auth-nest) and exception filter are
 * global: no route can opt out of either.
 */
@Module({})
export class AppModule implements NestModule {
  static register(deps: AppDependencies): DynamicModule {
    return {
      module: AppModule,
      imports: [
        SiriusAuthModule.forRoot<Principal>({
          resolvePrincipal: deps.resolvePrincipal,
          permissionsOf: permissionsOfPrincipal,
        }),
      ],
      controllers: [HealthController, MeController],
      providers: [
        { provide: ENV, useValue: deps.env },
        { provide: LOGGER, useValue: deps.logger },
        { provide: READINESS_CHECKS, useValue: deps.readinessChecks },
        { provide: SHUTDOWN_STATE, useValue: { isShuttingDown: deps.isShuttingDown } },
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
