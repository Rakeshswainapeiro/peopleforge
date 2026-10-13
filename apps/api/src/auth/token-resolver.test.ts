import { describe, expect, it } from 'vitest';
import { errorName } from './token-resolver.js';

describe('errorName', () => {
  it('logs the error class only, never a thrown non-error value', () => {
    expect(errorName(new TypeError('select … secret'))).toBe('TypeError');
    expect(errorName('raw string with data')).toBe('unknown');
  });
});
