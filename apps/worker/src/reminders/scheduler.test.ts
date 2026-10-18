import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogger } from '../test-support/logger.js';
import { startReminders } from './scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('startReminders [R1-13]', () => {
  it('checks at start and every interval, logging counts and failures', async () => {
    vi.useFakeTimers();
    const run = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(0);
    const { logger, lines } = captureLogger();
    const scheduler = startReminders({ run, intervalMs: 60_000, logger });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(lines().map((line) => [line.event, line.queued])).toEqual([
      ['reminders_queued', 2],
      ['reminders_failed', undefined],
      ['reminders_queued', 0],
    ]);
    expect(lines()[1]).toMatchObject({ err: 'Error' });
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('never overlaps runs, and stops after the one in progress', async () => {
    vi.useFakeTimers();
    let finish: (count: number) => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const { logger } = captureLogger();
    const scheduler = startReminders({ run, intervalMs: 1_000, logger });
    // The first run hangs across two ticks: no second run starts meanwhile.
    await vi.advanceTimersByTimeAsync(2_500);
    expect(run).toHaveBeenCalledTimes(1);
    const stopping = scheduler.stop();
    finish(0);
    await stopping;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('logs a thrown non-Error as unknown', async () => {
    const { logger, lines } = captureLogger();
    const scheduler = startReminders({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test
      run: () => Promise.reject('nope'),
      intervalMs: 60_000,
      logger,
    });
    await scheduler.stop();
    expect(lines()[0]).toMatchObject({ event: 'reminders_failed', err: 'unknown' });
  });
});
