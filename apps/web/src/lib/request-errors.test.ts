import { describe, expect, it } from 'vitest';
import { errorKeyFor, evidenceErrorKey, parseErrorKey, proposalErrorKey } from './request-errors';

describe('errorKeyFor', () => {
  it.each([
    ['CONFLICT', 'version', 'request.errors.stale'],
    ['CONFLICT', 'employeeId', 'request.errors.duplicate'],
    ['CONFLICT', 'criteria', 'request.errors.generic'],
    ['VALIDATION_FAILED', 'employeeId', 'request.errors.employeeNotFound'],
    ['VALIDATION_FAILED', 'cycleId', 'request.errors.cycleNotOpen'],
    ['VALIDATION_FAILED', 'entityId', 'request.errors.generic'],
    [
      'VALIDATION_FAILED',
      'assessment.results.0.justification',
      'request.errors.justificationTooLong',
    ],
    ['NOT_FOUND', '', 'request.errors.notFound'],
    ['CONFLICT', 'status', 'request.errors.notDraft'],
    ['VALIDATION_FAILED', 'cycle', 'request.errors.deadlinePassed'],
    ['VALIDATION_FAILED', 'lines.0', 'request.errors.notReady'],
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

describe('evidenceErrorKey [R1-04]', () => {
  it.each([
    [413, 'PAYLOAD_TOO_LARGE', '', '', 'evidence.errors.tooLarge'],
    [404, 'NOT_FOUND', '', '', 'evidence.errors.notFound'],
    [409, 'CONFLICT', 'file', 'limit', 'evidence.errors.limit'],
    [400, 'VALIDATION_FAILED', 'file', 'media_type', 'evidence.errors.type'],
    [400, 'VALIDATION_FAILED', 'file', 'infected', 'evidence.errors.infected'],
    [400, 'VALIDATION_FAILED', 'file', 'required', 'evidence.errors.required'],
    [400, 'VALIDATION_FAILED', 'file', 'other', 'evidence.errors.generic'],
    [400, 'VALIDATION_FAILED', 'criterionId', 'no_evidence', 'evidence.errors.generic'],
  ] as const)('%i %s %s %s → %s', (status, code, path, detail, expected) => {
    expect(evidenceErrorKey(status, code, path === '' ? [] : [{ path, code: detail }])).toBe(
      expected,
    );
  });
});
