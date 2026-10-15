import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogger } from '../test-support/logger.js';
import { startLoop } from './loop.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('startLoop', () => {
  it('keeps going while batches are full, then waits for the poll interval', async () => {
    vi.useFakeTimers();
    const sizes = [10, 10, 3, 0];
    const runBatch = vi.fn(() => Promise.resolve(sizes.shift() ?? 0));
    const { logger } = captureLogger();
    const loop = startLoop({ runBatch, batchSize: 10, pollMs: 5_000, logger, now: () => 42 });
    await vi.advanceTimersByTimeAsync(0);
    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(loop.lastSuccessAt()).toBe(42);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runBatch).toHaveBeenCalledTimes(4);
    await loop.stop();
  });

  it('logs a failed batch without details and retries after the interval', async () => {
    vi.useFakeTimers();
    const runBatch = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new TypeError('connection refused to 10.0.0.5'))
      .mockRejectedValueOnce('odd')
      .mockResolvedValue(0);
    const { logger, lines } = captureLogger();
    const loop = startLoop({ runBatch, batchSize: 10, pollMs: 1_000, logger });
    await vi.advanceTimersByTimeAsync(0);
    expect(loop.lastSuccessAt()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(loop.lastSuccessAt()).toBeTypeOf('number');
    expect(lines().map((line) => [line.event, line.err])).toEqual([
      ['email_batch_failed', 'TypeError'],
      ['email_batch_failed', 'unknown'],
    ]);
    expect(JSON.stringify(lines())).not.toContain('10.0.0.5');
    await loop.stop();
  });

  it('stops after the batch in progress, without waiting out the interval', async () => {
    let finish: (count: number) => void = () => undefined;
    const runBatch = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const { logger } = captureLogger();
    const loop = startLoop({ runBatch, batchSize: 10, pollMs: 60_000, logger });
    const stopped = loop.stop();
    finish(10);
    await stopped;
    expect(runBatch).toHaveBeenCalledTimes(1);
    // Stopping twice is harmless.
    await loop.stop();
  });

  it('wakes from the wait when stopped', async () => {
    const { logger } = captureLogger();
    const loop = startLoop({
      runBatch: () => Promise.resolve(0),
      batchSize: 10,
      pollMs: 60_000,
      logger,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await loop.stop();
    expect(loop.lastSuccessAt()).toBeTypeOf('number');
  });
});
