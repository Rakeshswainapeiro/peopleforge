import { describe, expect, it, vi } from 'vitest';
import { testEnv } from '../test-support/factory.js';
import { callerKey, rateLimiter } from './security.js';

describe('callerKey', () => {
  it('counts a request against its access token, never keeping the token itself', () => {
    const key = callerKey('Bearer eyJhbGciOi.secret.sig', '10.0.0.5');
    expect(key).toMatch(/^token:[\w-]{43}$/u);
    expect(key).not.toContain('secret');
    expect(callerKey('Bearer eyJhbGciOi.secret.sig', '10.0.0.9')).toBe(key);
    expect(callerKey('Bearer other', '10.0.0.5')).not.toBe(key);
  });

  it('falls back to the IP (IPv6 by /56 block) without a token', () => {
    expect(callerKey(undefined, '10.0.0.5')).toBe('ip:10.0.0.5');
    expect(callerKey('  ', '10.0.0.5')).toBe('ip:10.0.0.5');
    expect(callerKey(undefined, '2001:db8:1:2:3:4:5:6')).toBe(
      callerKey(undefined, '2001:db8:1:2:aaaa:bbbb:cccc:dddd'),
    );
    expect(callerKey(undefined, undefined)).toMatch(/^ip:/u);
  });
});

describe('rateLimiter', () => {
  it('starts without the library’s IPv6 warning: callerKey already applies ipKeyGenerator', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(rateLimiter(testEnv())).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
