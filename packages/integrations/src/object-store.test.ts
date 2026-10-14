import { describe, expect, it } from 'vitest';
import { assertSafeKey } from './object-store.js';

describe('assertSafeKey', () => {
  it.each(['evidence/0b6f1f0e-3f5c-4c1a-9a65-2b0e3c1d9f10', 'a', 'a/b/c/d/e', 'x'.repeat(64)])(
    'accepts generated keys: %s',
    (key) => {
      expect(() => {
        assertSafeKey(key);
      }).not.toThrow();
    },
  );

  it.each([
    '',
    '../etc/passwd',
    'evidence/../secret',
    '/absolute',
    'trailing/',
    'a//b',
    'Upper',
    'a/b/c/d/e/f',
    'x'.repeat(65),
    'evidence\\windows',
    'name.pdf',
    'space here',
  ])('refuses anything else: %j', (key) => {
    expect(() => {
      assertSafeKey(key);
    }).toThrow(TypeError);
  });
});
