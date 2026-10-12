import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { getRequestId, setRequestId } from './locals.js';

function fakeResponse(): Response {
  return { locals: {} } as Response;
}

describe('response locals', () => {
  it('round-trips the request ID and falls back when missing', () => {
    const res = fakeResponse();
    expect(getRequestId(res)).toBe('unknown');
    setRequestId(res, 'req-123456');
    expect(getRequestId(res)).toBe('req-123456');
  });
});
