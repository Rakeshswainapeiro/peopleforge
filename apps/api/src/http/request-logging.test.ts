import { describe, expect, it } from 'vitest';
import { isProbePath, logLevelFor } from './request-logging.js';

describe('request logging helpers', () => {
  it.each([
    [200, undefined, 'info'],
    [302, undefined, 'info'],
    [404, undefined, 'warn'],
    [500, undefined, 'error'],
    [200, new Error('stream reset'), 'error'],
  ])('maps status %i with error %s to %s', (status, error, level) => {
    expect(logLevelFor(status, error)).toBe(level);
  });

  it('skips logging for orchestrator probes only', () => {
    expect(isProbePath('/health/ready')).toBe(true);
    expect(isProbePath('/api/v1/me')).toBe(false);
    expect(isProbePath(undefined)).toBe(false);
  });
});
