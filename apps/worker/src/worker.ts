import { createEmailOutbox, type DatabaseHandle } from '@peopleforge/db';
import type { EmailSender } from '@peopleforge/integrations';
import { DEFAULT_LOCALE } from '@sirius/shared-types';
import type { Server } from 'node:http';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import { renderEmail } from './email/templates.js';
import { createHealthServer } from './health/server.js';
import { startLoop } from './outbox/loop.js';
import { startMonitor } from './outbox/monitor.js';
import { processBatch } from './outbox/processor.js';

export interface WorkerDependencies {
  env: Env;
  logger: Logger;
  database: DatabaseHandle;
  sender: EmailSender;
  now?: () => number;
}

export interface Worker {
  /** Listening for probes; resolves once the port is open. */
  start: () => Promise<Server>;
  /** Finishes the batch in progress, then closes the probe port and the database. */
  stop: () => Promise<void>;
}

/**
 * The email worker (ADR-012): the outbox loop, its monitor and the probe port. Liveness fails
 * when no batch has succeeded for three lease periods, so a stuck worker gets restarted.
 */
export function createWorker({
  env,
  logger,
  database,
  sender,
  now = Date.now,
}: WorkerDependencies): Worker {
  const outbox = createEmailOutbox(database.db);
  // Recipients' language isn't stored yet: English until Arabic content exists (CR).
  const render: Parameters<typeof processBatch>[0]['render'] = (job) =>
    renderEmail(job, { portalUrl: env.PORTAL_URL, locale: DEFAULT_LOCALE });
  const startedAt = now();
  let loop: ReturnType<typeof startLoop> | undefined;
  let stopMonitor: (() => void) | undefined;
  const health = createHealthServer({
    isLive: () => now() - (loop?.lastSuccessAt() ?? startedAt) < env.OUTBOX_LEASE_MS * 3,
    checks: [
      { name: 'database', check: () => database.ping() },
      { name: 'email', check: () => sender.ping() },
    ],
    timeoutMs: env.READINESS_CHECK_TIMEOUT_MS,
  });

  return {
    start: async () => {
      await new Promise<void>((resolve) => health.listen(env.HEALTH_PORT, resolve));
      loop = startLoop({
        runBatch: () =>
          processBatch({
            outbox,
            sender,
            render,
            logger,
            maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
            batchSize: env.OUTBOX_BATCH_SIZE,
            leaseMs: env.OUTBOX_LEASE_MS,
          }),
        batchSize: env.OUTBOX_BATCH_SIZE,
        pollMs: env.OUTBOX_POLL_MS,
        logger,
        now,
      });
      stopMonitor = startMonitor({
        stats: outbox.stats,
        intervalMs: env.OUTBOX_STATS_INTERVAL_MS,
        alertAfterSeconds: env.OUTBOX_ALERT_AFTER_S,
        logger,
      });
      logger.info(
        { port: env.HEALTH_PORT, transport: sender.transport, appEnv: env.APP_ENV },
        'Worker started',
      );
      return health;
    },
    stop: async () => {
      stopMonitor?.();
      await loop?.stop();
      await new Promise<void>((resolve) => {
        health.close(() => {
          resolve();
        });
      });
      await database.close();
      logger.info('Worker stopped');
    },
  };
}
