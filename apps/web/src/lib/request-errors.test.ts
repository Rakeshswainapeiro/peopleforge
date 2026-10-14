import { describe, expect, it } from 'vitest';
import { errorKeyFor, parseErrorKey, proposalErrorKey } from './request-errors';

describe('errorKeyFor', () => {
  it.each([
    ['CONFLICT', 'version', 'request.errors.stale'],
    ['CONFLICT', 'employeeId', 'request.errors.duplicate'],
    ['CONFLICT', 'criteria', 'request.errors.generic'],
    ['VALIDATION_FAILED', 'employeeId', 'request.errors.employeeNotFound'],
    ['VALIDATION_FAILED', 'cycleId', 'request.errors.cycleNotOpen'],
    ['VALIDATION_FAILED', 'entityId', 'request.errors.generic'],
    ['NOT_FOUND', '', 'request.errors.notFound'],
    ['FORBIDDEN', '', 'request.errors.generic'],
  ] as const)('%s on %s → %s', (code, path, expected) => {
    expect(errorKeyFor(code, path === '' ? [] : [{ path, code: 'x' }])).toBe(expected);
  });
});

describe('proposalErrorKey', () => {
  it('maps the API’s proposal problems', () => {
    expect(proposalErrorKey('not_positive')).toBe('request.errors.notPositive');
    expect(proposalErrorKey('over_limit')).toBe('request.errors.overLimit');
    expect(proposalErrorKey('decimal')).toBe('request.errors.format');
  });
});

describe('parseErrorKey', () => {
  it('accepts only known keys from the URL', () => {
    expect(parseErrorKey('request.errors.stale')).toBe('request.errors.stale');
    expect(parseErrorKey('<script>')).toBeUndefined();
    expect(parseErrorKey(undefined)).toBeUndefined();
  });
});
