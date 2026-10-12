import type { Logger } from 'pino';

export interface Closable {
  close: (callback: (error?: Error) => void) => void;
}

export interface ShutdownOptions {
  server: Closable;
  logger: Logger;
  timeoutMs: number;
  exit: (code: number) => void;
  /** Extra resources (DB pool, queues) closed after the HTTP server stops accepting work. */
  onClose?: () => Promise<void>;
}

/**
 * Graceful shutdown: flip readiness to 503 so the load balancer drains traffic, stop accepting
 * connections, let in-flight requests finish, then close dependencies. A hard deadline
 * guarantees the process exits inside the orchestrator's termination grace period.
 */
export function createShutdown({ server, logger, timeoutMs, exit, onClose }: ShutdownOptions): {
  isShuttingDown: () => boolean;
  shutdown: (signal: string) => Promise<void>;
} {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown started');

    const deadline = setTimeout(() => {
      logger.error('Shutdown deadline exceeded; forcing exit');
      exit(1);
    }, timeoutMs);
    deadline.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await onClose?.();
      logger.info('Shutdown complete');
      clearTimeout(deadline);
      exit(0);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Shutdown failed');
      clearTimeout(deadline);
      exit(1);
    }
  }

  return { isShuttingDown: () => shuttingDown, shutdown };
}
