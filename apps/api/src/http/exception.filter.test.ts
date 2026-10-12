import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  MethodNotAllowedException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '../errors/domain-errors.js';
import { errorOf, silentLogger, track } from '../test-support/factory.js';
import { ApiExceptionFilter, mapError } from './exception.filter.js';
import { requestId } from './request-id.js';

let toThrow: unknown;

@Controller('boom')
class BoomController {
  @Get()
  boom(): never {
    throw toThrow;
  }
}

async function serverThrowing(error: unknown) {
  toThrow = error;
  const moduleRef = await Test.createTestingModule({
    controllers: [BoomController],
    providers: [{ provide: APP_FILTER, useValue: new ApiExceptionFilter(silentLogger()) }],
  }).compile();
  const app = track(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
  app.use(requestId);
  await app.init();
  return app.getHttpServer();
}

function bodyParserError(type: string): Error & { type: string } {
  return Object.assign(new Error('parser'), { type });
}

describe('ApiExceptionFilter', () => {
  it.each([
    [new ValidationError('bad', [{ path: 'limit', code: 'too_big' }]), 400, 'VALIDATION_FAILED'],
    [new UnauthenticatedError('no'), 401, 'UNAUTHENTICATED'],
    [new ForbiddenError('no'), 403, 'FORBIDDEN'],
    [new NotFoundError('no'), 404, 'NOT_FOUND'],
    [new ConflictError('no'), 409, 'CONFLICT'],
  ])('maps %s to %i %s with the request ID', async (error, status, code) => {
    const res = await request(await serverThrowing(error)).get('/boom');
    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
    expect(errorOf(res).messageKey).toBe(`errors.${code}`);
    expect(errorOf(res).requestId).toBe(res.headers['x-request-id']);
  });

  it('includes domain error details when present and omits them otherwise', async () => {
    const withDetails = await request(
      await serverThrowing(new ValidationError('bad', [{ path: 'limit', code: 'too_big' }])),
    ).get('/boom');
    expect(errorOf(withDetails).details).toEqual([{ path: 'limit', code: 'too_big' }]);

    const without = await request(await serverThrowing(new ForbiddenError('no'))).get('/boom');
    expect(errorOf(without)).not.toHaveProperty('details');
  });

  it('turns schema failures into field-level details without echoing input', async () => {
    const parsed = z.object({ amount: z.number().positive() }).safeParse({ amount: -5000 });
    const res = await request(await serverThrowing(parsed.error)).get('/boom');
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toEqual([{ path: 'amount', code: 'too_small' }]);
    expect(JSON.stringify(res.body)).not.toContain('5000');
  });

  it('never leaks the message of an unexpected error', async () => {
    const res = await request(await serverThrowing(new Error('secret internals'))).get('/boom');
    expect(res.status).toBe(500);
    expect(errorOf(res).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret internals');
  });
});

describe('mapError', () => {
  it.each([
    ['entity.too.large', 413, 'PAYLOAD_TOO_LARGE'],
    ['entity.parse.failed', 400, 'VALIDATION_FAILED'],
    ['encoding.unsupported', 400, 'VALIDATION_FAILED'],
    ['charset.unsupported', 400, 'VALIDATION_FAILED'],
    ['stream.not.readable', 500, 'INTERNAL_ERROR'],
  ])('maps body-parser error %s to %i', (type, status, code) => {
    expect(mapError(bodyParserError(type))).toEqual({ status, code });
  });

  it.each([
    [new NotFoundException(), 404, 'NOT_FOUND'],
    [new MethodNotAllowedException(), 404, 'NOT_FOUND'],
    [new HttpException('slow down', 429), 429, 'RATE_LIMITED'],
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new BadRequestException(), 400, 'VALIDATION_FAILED'],
    [new HttpException('teapot', 418), 500, 'INTERNAL_ERROR'],
  ])('maps Nest %s to %i %s', (error, status, code) => {
    expect(mapError(error)).toEqual({ status, code });
  });

  it.each([
    ['a thrown string', 'oops'],
    ['an object with a non-string type', { type: 42 }],
    ['null', null],
    ['undefined', undefined],
  ])('maps %s to an internal error', (_label, error) => {
    expect(mapError(error)).toEqual({ status: 500, code: 'INTERNAL_ERROR' });
  });
});
