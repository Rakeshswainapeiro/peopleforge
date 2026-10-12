import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  DEFAULT_PAGE_SIZE,
  DEFAULT_LOCALE,
  LivenessResponseSchema,
  MAX_PAGE_SIZE,
  PaginationQuerySchema,
  ReadinessResponseSchema,
  directionFor,
  messageKeyFor,
  pageSchema,
  resolveLocale,
} from './index.js';
import { z } from 'zod';

describe('locale', () => {
  it('maps Arabic to rtl and English to ltr', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });

  it.each([undefined, null, '', 'fr', 'AR', 42, { locale: 'ar' }])(
    'falls back to the default locale for untrusted input %j',
    (input) => {
      expect(resolveLocale(input)).toBe(DEFAULT_LOCALE);
    },
  );

  it('accepts supported locales', () => {
    expect(resolveLocale('ar')).toBe('ar');
    expect(resolveLocale('en')).toBe('en');
  });
});

describe('api error', () => {
  it('derives a translatable message key from the code', () => {
    expect(messageKeyFor('FORBIDDEN')).toBe('errors.FORBIDDEN');
  });

  it('rejects unknown error codes', () => {
    const result = ApiErrorSchema.safeParse({
      error: { code: 'TEAPOT', messageKey: 'x', requestId: 'r' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts the documented error shape with details', () => {
    const result = ApiErrorSchema.safeParse({
      error: {
        code: 'VALIDATION_FAILED',
        messageKey: 'errors.VALIDATION_FAILED',
        requestId: 'req-1',
        details: [{ path: 'limit', code: 'too_big' }],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('pagination', () => {
  it('applies the default page size', () => {
    expect(PaginationQuerySchema.parse({}).limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('coerces numeric strings from query parameters', () => {
    expect(PaginationQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it.each([0, MAX_PAGE_SIZE + 1, 1.5, 'abc'])('rejects out-of-range limit %j', (limit) => {
    expect(PaginationQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('accepts the boundary values', () => {
    expect(PaginationQuerySchema.parse({ limit: 1 }).limit).toBe(1);
    expect(PaginationQuerySchema.parse({ limit: MAX_PAGE_SIZE }).limit).toBe(MAX_PAGE_SIZE);
  });

  it('rejects an oversized cursor', () => {
    expect(PaginationQuerySchema.safeParse({ cursor: 'x'.repeat(513) }).success).toBe(false);
  });

  it('builds a typed page schema', () => {
    const schema = pageSchema(z.object({ id: z.string() }));
    expect(schema.parse({ items: [{ id: 'a' }], nextCursor: null })).toEqual({
      items: [{ id: 'a' }],
      nextCursor: null,
    });
    expect(schema.safeParse({ items: [{ id: 1 }], nextCursor: null }).success).toBe(false);
  });
});

describe('health', () => {
  it('validates readiness and liveness payloads', () => {
    expect(
      ReadinessResponseSchema.safeParse({ status: 'ready', checks: { database: 'up' } }).success,
    ).toBe(true);
    expect(LivenessResponseSchema.safeParse({ status: 'alive' }).success).toBe(true);
    expect(LivenessResponseSchema.safeParse({ status: 'dead' }).success).toBe(false);
  });
});
