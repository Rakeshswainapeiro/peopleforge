import { createLogger } from '@sirius-hr/utils';
import { createApp } from './app.js';
import { unconfiguredSessionResolver } from './auth/authenticate.js';
import { ConfigError, loadEnv } from './config/env.js';
import { createShutdown } from './lifecycle/shutdown.js';

function start(): void {
  let env;
  try {
    env = loadEnv(process.env);
  } catch (error: unknown) {
    // Fail fast before anything listens. Only key names are printed, never values.
    const message = error instanceof ConfigError ? error.message : 'Configuration failed';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }

  const logger = createLogger({ service: 'api', level: env.LOG_LEVEL });
  let isShuttingDown = (): boolean => false;

  const app = createApp({
    env,
    logger,
    sessionResolver: unconfiguredSessionResolver,
    readinessChecks: [],
    isShuttingDown: () => isShuttingDown(),
  });

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, appEnv: env.APP_ENV }, 'API listening');
  });
  // Keep-alive must outlive the load balancer's idle timeout to avoid 502s on reused sockets.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  const lifecycle = createShutdown({
    server,
    logger,
    timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    exit: (code) => process.exit(code),
  });
  isShuttingDown = lifecycle.isShuttingDown;

  process.on('SIGTERM', () => void lifecycle.shutdown('SIGTERM'));
  process.on('SIGINT', () => void lifecycle.shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    void lifecycle.shutdown('unhandledRejection');
  });
}

start();
