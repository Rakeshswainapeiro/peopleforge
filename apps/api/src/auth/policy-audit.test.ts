import { Controller, Get, Post } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { buildApp, track } from '../test-support/factory.js';
import {
  assertEveryRouteHasPolicy,
  findRoutesWithoutPolicy,
  MissingPolicyError,
} from './policy-audit.js';
import { Authenticated, Public } from './policy.js';

@Controller('covered')
@Authenticated()
class ClassCovered {
  @Get() list(): string {
    return 'ok';
  }
  @Get('open') @Public() open(): string {
    return 'ok';
  }
  helper(): string {
    return 'not a route';
  }
}

@Controller('gaps')
class Gaps {
  @Get() @Public() fine(): string {
    return 'ok';
  }
  @Get('a') forgotten(): string {
    return 'ok';
  }
  @Post('b') alsoForgotten(): string {
    return 'ok';
  }
}

async function appWith(...controllers: (new () => unknown)[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    controllers,
  }).compile();
  const app = track(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  return app;
}

describe('policy audit', () => {
  it('accepts controllers whose routes all have a method or class policy', async () => {
    const app = await appWith(ClassCovered);
    expect(findRoutesWithoutPolicy(app)).toEqual([]);
    expect(() => {
      assertEveryRouteHasPolicy(app);
    }).not.toThrow();
  });

  it('lists every route that has no policy', async () => {
    const app = await appWith(ClassCovered, Gaps);
    expect(findRoutesWithoutPolicy(app)).toEqual(['Gaps.forgotten', 'Gaps.alsoForgotten']);
  });

  it('refuses to start when a route has no policy', async () => {
    const app = await appWith(Gaps);
    expect(() => {
      assertEveryRouteHasPolicy(app);
    }).toThrow(MissingPolicyError);
  });

  it('passes for the real application (start-up would fail otherwise)', async () => {
    const app = await buildApp();
    expect(findRoutesWithoutPolicy(app)).toEqual([]);
  });
});
