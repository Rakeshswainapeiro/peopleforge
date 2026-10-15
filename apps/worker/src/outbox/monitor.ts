import type { OutboxStats } from '@peopleforge/db';
import type { Logger } from 'pino';

export interface MonitorOptions {
  stats: () => Promise<OutboxStats>;
  intervalMs: number;
  /** Warn when the oldest due email has waited longer than this. */
  alertAfterSeconds: number;
  logger: Logger;
}

/**
 * Logs the outbox's state every interval as `email_outbox_stats` (the metric to chart), and
 * warns as `email_outbox_alert` when emails are dead or due ones wait too long: the alert rules
 * in DEPLOYMENT.md §8 match on that event. Returns the function that stops it.
 */
export function startMonitor(options: MonitorOptions): () => void {
  const check = async () => {
    try {
      const stats = await options.stats();
      options.logger.info({ event: 'email_outbox_stats', ...stats }, 'Email outbox');
      if (stats.dead > 0 || stats.oldestDueSeconds > options.alertAfterSeconds) {
        options.logger.warn(
          { event: 'email_outbox_alert', ...stats },
          'Emails failed or are waiting too long (runbook: email-outbox.md)',
        );
      }
    } catch {
      options.logger.warn({ event: 'email_outbox_stats_failed' }, 'Email outbox stats unavailable');
    }
  };
  const timer = setInterval(() => void check(), options.intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
