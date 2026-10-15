import type { OutboxStats } from '@peopleforge/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogger } from '../test-support/logger.js';
import { startMonitor } from './monitor.js';

afterEach(() => {
  vi.useRealTimers();
});

const quiet: OutboxStats = { pending: 2, due: 0, dead: 0, oldestDueSeconds: 0 };

describe('startMonitor', () => {
  it('logs the outbox every interval, and alerts on dead or long-waiting emails', async () => {
    vi.useFakeTimers();
    const stats = vi
      .fn<() => Promise<OutboxStats>>()
      .mockResolvedValueOnce(quiet)
      .mockResolvedValueOnce({ ...quiet, dead: 1 })
      .mockResolvedValueOnce({ ...quiet, due: 3, oldestDueSeconds: 901 })
      .mockRejectedValueOnce(new Error('db down'));
    const { logger, lines } = captureLogger();
    const stop = startMonitor({ stats, intervalMs: 60_000, alertAfterSeconds: 900, logger });
    await vi.advanceTimersByTimeAsync(240_000);
    expect(lines().map((line) => line.event)).toEqual([
      'email_outbox_stats',
      'email_outbox_stats',
      'email_outbox_alert',
      'email_outbox_stats',
      'email_outbox_alert',
      'email_outbox_stats_failed',
    ]);
    expect(lines()[0]).toMatchObject({ pending: 2, due: 0, dead: 0 });
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stats).toHaveBeenCalledTimes(4);
  });
});
