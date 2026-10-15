import { createDatabase } from '@peopleforge/db';
import { emailSenderFromEnv } from '@peopleforge/integrations';
import { createLogger } from '@sirius/utils';
import { ConfigError, loadEnv, type Env } from './config/env.js';
import { createWorker } from './worker.js';

let env: Env;
try {
  env = loadEnv(process.env);
} catch (error: unknown) {
  // Fail fast before anything runs. Only key names are printed, never values.
  process.stderr.write(
    `${error instanceof ConfigError ? error.message : 'Configuration failed'}\n`,
  );
  process.exit(1);
}

const logger = createLogger({ service: 'worker', level: env.LOG_LEVEL });
const worker = createWorker({
  env,
  logger,
  // The worker role: the email outbox only (ADR-012).
  database: createDatabase({
    connectionString: env.WORKER_DATABASE_URL,
    poolMax: env.DATABASE_POOL_MAX,
  }),
  sender: emailSenderFromEnv(env),
});
await worker.start();

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Shutdown started');
  // Inside the orchestrator's grace period even if an SMTP call hangs.
  const deadline = setTimeout(() => {
    logger.error('Shutdown deadline exceeded; forcing exit');
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  deadline.unref();
  await worker.stop();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection');
});
