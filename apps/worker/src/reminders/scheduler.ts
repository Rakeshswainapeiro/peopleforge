import type { Logger } from 'pino';

export interface ReminderSchedulerOptions {
  /** Queues the reminders due now; returns how many (notify.queue_reminders()). */
  run: () => Promise<number>;
  intervalMs: number;
  logger: Logger;
}

export interface ReminderScheduler {
  /** Stops after the run in progress (graceful shutdown). */
  stop: () => Promise<void>;
}

/**
 * Checks the configured triggers (R1-13) at start and then every `intervalMs`. Each reminder is
 * queued once (the database records it), so overlapping workers or a restart never repeat one;
 * the email worker then sends them like any notification. A failed run is logged and retried at
 * the next tick.
 */
export function startReminders(options: ReminderSchedulerOptions): ReminderScheduler {
  let running: Promise<void> = Promise.resolve();
  let stopped = false;

  const tick = () => {
    running = (async () => {
      try {
        const queued = await options.run();
        options.logger.info({ event: 'reminders_queued', queued }, 'Reminders checked');
      } catch (error: unknown) {
        options.logger.error(
          { event: 'reminders_failed', err: error instanceof Error ? error.name : 'unknown' },
          'Reminder check failed; retrying at the next interval',
        );
      }
    })();
  };

  tick();
  const timer = setInterval(() => {
    // One run at a time: a slow run delays the next instead of overlapping it.
    void running.then(() => {
      if (!stopped) tick();
    });
  }, options.intervalMs);

  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
