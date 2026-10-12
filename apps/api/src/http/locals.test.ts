import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { getPrincipal, getRequestId, setPrincipal, setRequestId } from './locals.js';

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

  it('round-trips the principal and returns undefined when absent', () => {
    const res = fakeResponse();
    expect(getPrincipal(res)).toBeUndefined();
    setPrincipal(res, { userId: 'u1', roles: [], scope: 'group' });
    expect(getPrincipal(res)).toEqual({ userId: 'u1', roles: [], scope: 'group' });
  });

  it('ignores non-object principal values', () => {
    const res = fakeResponse();
    res.locals.principal = 'forged';
    expect(getPrincipal(res)).toBeUndefined();
  });
});
