import { describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({ serverEnv: () => ({ LOG_LEVEL: 'silent' }) }));

describe('getLogger', () => {
  it('creates one redacting logger for the web service', async () => {
    const { getLogger } = await import('./logger');
    const logger = getLogger();
    expect(logger).toBe(getLogger());
    expect(logger.level).toBe('silent');
  });
});
