import type { Logger } from 'pino';

export interface LoopOptions {
  /** One batch; returns how many emails it claimed. */
  runBatch: () => Promise<number>;
  batchSize: number;
  /** Wait between polls when the queue is empty, and after an error. */
  pollMs: number;
  logger: Logger;
  now?: () => number;
}

export interface Loop {
  /** Stops after the batch in progress (graceful shutdown). */
  stop: () => Promise<void>;
  /** When the last batch finished without error (ms since epoch); undefined before the first. */
  lastSuccessAt: () => number | undefined;
}

/**
 * Polls the outbox: a full batch means more may be waiting, so the next starts at once; a short
 * one means the queue is drained, so it waits `pollMs`. An error (database down) is logged and
 * retried after `pollMs`; claimed emails come back when their lease ends.
 */
export function startLoop(options: LoopOptions): Loop {
  const now = options.now ?? Date.now;
  let stopRequested = false;
  // Read through a function: stop() sets it while the loop awaits.
  const stopped = () => stopRequested;
  let lastSuccess: number | undefined;
  let wake: (() => void) | undefined;

  const pause = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, options.pollMs);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  const running = (async () => {
    while (!stopped()) {
      let claimed = 0;
      try {
        claimed = await options.runBatch();
        lastSuccess = now();
      } catch (error: unknown) {
        options.logger.error(
          { event: 'email_batch_failed', err: error instanceof Error ? error.name : 'unknown' },
          'Email batch failed; retrying',
        );
      }
      if (!stopped() && claimed < options.batchSize) await pause();
    }
  })();

  return {
    stop: async () => {
      stopRequested = true;
      wake?.();
      await running;
    },
    lastSuccessAt: () => lastSuccess,
  };
}
