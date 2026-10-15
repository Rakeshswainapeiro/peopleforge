import 'reflect-metadata';
import {
  createDatabase,
  createEntityDirectory,
  createDashboardRepository,
  createIncrementRequestRepository,
  createNotificationRepository,
  type FieldCipher,
} from '@peopleforge/db';
import { malwareScannerFromEnv, objectStoreFromEnv } from '@peopleforge/integrations';
import { verifierFromEnv } from '@sirius/identity';
import { createLogger } from '@sirius/utils';
import { tokenResolver } from './auth/token-resolver.js';
import { createApp } from './bootstrap/create-app.js';
import { cipherFromEnv, ConfigError, loadEnv, type Env } from './config/env.js';
import { createShutdown } from './lifecycle/shutdown.js';

async function start(): Promise<void> {
  let env: Env;
  let cipher: FieldCipher;
  try {
    env = loadEnv(process.env);
    cipher = cipherFromEnv(env);
  } catch (error: unknown) {
    // Fail fast before anything listens. Only key names are printed, never values.
    const message = error instanceof ConfigError ? error.message : 'Configuration failed';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }

  const logger = createLogger({ service: 'api', level: env.LOG_LEVEL });
  let isShuttingDown = (): boolean => false;

  // Connects as the app role; every query runs under Row-Level Security (ADR-002).
  const database = createDatabase({
    connectionString: env.DATABASE_URL,
    poolMax: env.DATABASE_POOL_MAX,
  });
  const directory = createEntityDirectory(database.db);
  const objectStore = objectStoreFromEnv(env);
  const malwareScanner = malwareScannerFromEnv(env);

  const app = await createApp({
    env,
    logger,
    // Signing keys are discovered from OIDC_ISSUER on first use (see @sirius/identity).
    resolvePrincipal: tokenResolver({ verifier: verifierFromEnv(env), logger, directory }),
    directory,
    incrementRequests: createIncrementRequestRepository(database.db, cipher),
    objectStore,
    malwareScanner,
    dashboard: createDashboardRepository(database.db, cipher),
    notifications: createNotificationRepository(database.db),
    // Uploads need both: without them the API is not ready to serve R1-04.
    readinessChecks: [
      { name: 'database', check: () => database.ping() },
      { name: 'object_store', check: () => objectStore.ping() },
      { name: 'malware_scanner', check: () => malwareScanner.ping() },
    ],
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
        app
          .close()
          .then(() => database.close())
          .then(
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
