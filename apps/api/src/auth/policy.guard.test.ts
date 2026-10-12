import {
  Controller,
  Get,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ApiExceptionFilter } from '../http/exception.filter.js';
import { setPrincipal } from '../http/locals.js';
import { errorOf, silentLogger, track } from '../test-support/factory.js';
import { ROLES } from './permissions.js';
import { Authenticated, Public, RequirePermission } from './policy.js';
import { PolicyGuard } from './policy.guard.js';

/** Test-only identity: roles come from a header so each request can act as any role. */
@Injectable()
class HeaderIdentityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const roles = req.header('x-test-roles');
    if (roles !== undefined) {
      setPrincipal(res, {
        userId: 'u-test',
        roles: roles.split(',').filter(Boolean),
        scope: 'group',
      });
    }
    next();
  }
}

@Controller('t')
class PolicyController {
  @Get('public') @Public() publicRoute(): string {
    return 'ok';
  }
  @Get('signed-in') @Authenticated() signedIn(): string {
    return 'ok';
  }
  @Get('decide') @RequirePermission('increment_request:decide') decide(): string {
    return 'ok';
  }
  @Get('review-and-decide')
  @RequirePermission('increment_request:review', 'increment_request:decide')
  both(): string {
    return 'ok';
  }
  @Get('configure') @RequirePermission('criteria:configure') configure(): string {
    return 'ok';
  }
  @Get('no-policy') noPolicy(): string {
    return 'ok';
  }
}

@Controller('reports')
@RequirePermission('report:read_executive')
class ClassPolicyController {
  @Get('executive') executive(): string {
    return 'ok';
  }
  @Get('status') @Public() status(): string {
    return 'ok';
  }
}

@Module({
  controllers: [PolicyController, ClassPolicyController],
  providers: [
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_FILTER, useValue: new ApiExceptionFilter(silentLogger()) },
  ],
})
class PolicyTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HeaderIdentityMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}

async function server() {
  const moduleRef = await Test.createTestingModule({ imports: [PolicyTestModule] }).compile();
  const app = track(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  return app.getHttpServer();
}

const ANON = null;
const NO_ROLE = '';
const { admin, reviewer, executive, subsidiaryHr } = ROLES;

// Every route × caller. A new route or role must be added here, so the access rules stay
// reviewed as a whole rather than one endpoint at a time.
const MATRIX: [route: string, caller: string | null, status: number][] = [
  ['/t/public', ANON, 200],
  ['/t/signed-in', ANON, 401],
  ['/t/signed-in', NO_ROLE, 200],
  ['/t/decide', ANON, 401],
  ['/t/decide', NO_ROLE, 403],
  ['/t/decide', subsidiaryHr, 403],
  ['/t/decide', admin, 403],
  ['/t/decide', executive, 403],
  ['/t/decide', reviewer, 200],
  ['/t/review-and-decide', reviewer, 200],
  ['/t/review-and-decide', subsidiaryHr, 403],
  ['/t/configure', admin, 200],
  ['/t/configure', reviewer, 403],
  ['/t/configure', `${admin},${executive}`, 200],
  ['/t/no-policy', ANON, 403],
  ['/t/no-policy', admin, 403],
  ['/t/no-policy', reviewer, 403],
  ['/reports/executive', executive, 200],
  ['/reports/executive', reviewer, 200],
  ['/reports/executive', subsidiaryHr, 403],
  ['/reports/executive', ANON, 401],
  ['/reports/status', ANON, 200],
];

describe('PolicyGuard', () => {
  it.each(MATRIX)('GET %s as %j → %i', async (route, caller, status) => {
    const req = request(await server()).get(route);
    const res = await (caller === null ? req : req.set('x-test-roles', caller));
    expect(res.status).toBe(status);
    if (status === 401) expect(errorOf(res).code).toBe('UNAUTHENTICATED');
    if (status === 403) expect(errorOf(res).code).toBe('FORBIDDEN');
  });
});
