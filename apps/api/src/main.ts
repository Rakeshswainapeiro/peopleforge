import 'reflect-metadata';
import { createLogger } from '@sirius-hr/utils';
import { unconfiguredSessionResolver } from './auth/session.js';
import { createApp } from './bootstrap/create-app.js';
import { ConfigError, loadEnv, type Env } from './config/env.js';
import { createShutdown } from './lifecycle/shutdown.js';

async function start(): Promise<void> {
  let env: Env;
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

  const app = await createApp({
    env,
    logger,
    sessionResolver: unconfiguredSessionResolver,
    readinessChecks: [],
    isShuttingDown: () => isShuttingDown(),
  });

  await app.listen(env.PORT);
  const server = app.getHttpServer();
  // Keep-alive must outlive the load balancer's idle timeout to avoid 502s on reused sockets.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;
  logger.info({ port: env.PORT, appEnv: env.APP_ENV }, 'API listening');

  const lifecycle = createShutdown({
    server: {
      close: (callback) => {
        app.close().then(
          () => {
            callback();
          },
          (error: unknown) => {
            callback(error instanceof Error ? error : new Error('Close failed'));
          },
        );
      },
    },
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

void start();
