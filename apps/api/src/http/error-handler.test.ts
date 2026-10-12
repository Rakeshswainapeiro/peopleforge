import express from 'express';
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
import { errorOf, silentLogger } from '../test-support/factory.js';
import { createErrorHandler, mapError } from './error-handler.js';
import { requestId } from './request-id.js';

function appThrowing(error: unknown) {
  const app = express();
  app.use(requestId);
  app.get('/boom', () => {
    throw error;
  });
  app.use(createErrorHandler(silentLogger()));
  return app;
}

function bodyParserError(type: string): Error & { type: string } {
  return Object.assign(new Error('parser'), { type });
}

describe('createErrorHandler', () => {
  it.each([
    [new ValidationError('bad', [{ path: 'limit', code: 'too_big' }]), 400, 'VALIDATION_FAILED'],
    [new UnauthenticatedError('no'), 401, 'UNAUTHENTICATED'],
    [new ForbiddenError('no'), 403, 'FORBIDDEN'],
    [new NotFoundError('no'), 404, 'NOT_FOUND'],
    [new ConflictError('no'), 409, 'CONFLICT'],
  ])('maps %s to %i %s', async (error, status, code) => {
    const res = await request(appThrowing(error)).get('/boom');
    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
    expect(errorOf(res).messageKey).toBe(`errors.${code}`);
    expect(errorOf(res).requestId).toBe(res.headers['x-request-id']);
  });

  it('includes domain error details when present and omits them otherwise', async () => {
    const withDetails = await request(
      appThrowing(new ValidationError('bad', [{ path: 'limit', code: 'too_big' }])),
    ).get('/boom');
    expect(errorOf(withDetails).details).toEqual([{ path: 'limit', code: 'too_big' }]);

    const without = await request(appThrowing(new ForbiddenError('no'))).get('/boom');
    expect(errorOf(without)).not.toHaveProperty('details');
  });

  it('turns schema failures into field-level validation details without echoing input', async () => {
    const parsed = z.object({ amount: z.number().positive() }).safeParse({ amount: -5000 });
    const res = await request(appThrowing(parsed.error)).get('/boom');
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toEqual([{ path: 'amount', code: 'too_small' }]);
    expect(JSON.stringify(res.body)).not.toContain('5000');
  });

  it.each([
    ['entity.too.large', 413, 'PAYLOAD_TOO_LARGE'],
    ['entity.parse.failed', 400, 'VALIDATION_FAILED'],
    ['encoding.unsupported', 400, 'VALIDATION_FAILED'],
    ['charset.unsupported', 400, 'VALIDATION_FAILED'],
    ['stream.not.readable', 500, 'INTERNAL_ERROR'],
  ])('maps body-parser error %s to %i', async (type, status, code) => {
    const res = await request(appThrowing(bodyParserError(type))).get('/boom');
    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });

  it.each([
    ['a plain Error', new Error('secret internals')],
    ['a thrown string', 'oops'],
    ['an object with a non-string type', { type: 42 }],
  ])('treats %s as an internal error', async (_label, error) => {
    const res = await request(appThrowing(error)).get('/boom');
    expect(res.status).toBe(500);
    expect(errorOf(res).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret internals');
  });

  // Express itself turns `next(null)` into "no error", so falsy throws are checked directly.
  it.each([null, undefined])('maps a thrown %s to an internal error', (error) => {
    expect(mapError(error)).toEqual({ status: 500, code: 'INTERNAL_ERROR' });
  });
});
