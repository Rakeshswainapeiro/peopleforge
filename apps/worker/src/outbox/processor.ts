import type { EmailOutbox, OutboxJob, OutboxOutcome } from '@peopleforge/db';
import { EmailDeliveryError, type EmailSender } from '@peopleforge/integrations';
import type { Logger } from 'pino';
import type { Rendered } from '../email/templates.js';

/**
 * How long to wait after each failed attempt: 1 min, 5 min, 30 min, 2 h, then 6 h. With the
 * default 6 attempts an email keeps trying for about 8½ hours (a provider outage over a working
 * day) before it is marked dead and alerted on.
 */
export const BACKOFF_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  6 * 3_600_000,
];

export interface ProcessorOptions {
  outbox: EmailOutbox;
  sender: EmailSender;
  render: (job: OutboxJob) => Rendered;
  logger: Logger;
  maxAttempts: number;
  batchSize: number;
  leaseMs: number;
  backoffMs?: readonly number[];
}

/** The wait before the next try, after `attempts` failed ones (the last step repeats). */
export function backoffFor(attempts: number, schedule: readonly number[] = BACKOFF_MS): number {
  return schedule[Math.min(Math.max(attempts, 1), schedule.length) - 1] ?? 60_000;
}

/** What to do with one email. Never throws for the email's own reasons; only for the outbox. */
async function attempt(job: OutboxJob, options: ProcessorOptions): Promise<OutboxOutcome> {
  if (job.recipient.address === null) return { status: 'skipped', reason: 'no_address' };
  const rendered = options.render(job);
  if (!rendered.ok) return { status: 'skipped', reason: rendered.reason };
  try {
    const { messageId } = await options.sender.send({
      to: job.recipient.address,
      ...rendered.email,
    });
    return { status: 'sent', messageId };
  } catch (error: unknown) {
    const failure =
      error instanceof EmailDeliveryError ? error : new EmailDeliveryError('unknown', false);
    const attempts = job.attempts + 1;
    if (failure.permanent || attempts >= options.maxAttempts) {
      return { status: 'dead', reason: failure.reason };
    }
    return {
      status: 'retry',
      delayMs: backoffFor(attempts, options.backoffMs),
      reason: failure.reason,
    };
  }
}

/**
 * Sends one batch of due emails (ADR-012): claims them, sends each, records the outcome.
 * Logs say what happened to which outbox row, and to a user or a role, never the address.
 * Returns how many were claimed, so the loop knows whether more are waiting.
 */
export async function processBatch(options: ProcessorOptions): Promise<number> {
  const jobs = await options.outbox.claim({ limit: options.batchSize, leaseMs: options.leaseMs });
  for (const job of jobs) {
    const outcome = await attempt(job, options);
    await options.outbox.finish(job.id, outcome);
    const context = {
      event: `email_${outcome.status}`,
      outboxId: job.id,
      kind: job.kind,
      recipient: job.recipient.kind === 'role' ? job.recipient.role : 'user',
      attempts: job.attempts + (outcome.status === 'skipped' ? 0 : 1),
      ...(outcome.status === 'sent' ? {} : { reason: outcome.reason }),
    };
    if (outcome.status === 'sent') options.logger.info(context, 'Email sent');
    else if (outcome.status === 'dead') options.logger.error(context, 'Email failed for good');
    // Retries and skips (no address, e.g. a role without a mailbox) are expected now and then.
    else options.logger.warn(context, 'Email not sent now');
  }
  return jobs.length;
}
