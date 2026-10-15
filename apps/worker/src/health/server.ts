import { createServer, type Server } from 'node:http';

export interface HealthOptions {
  /** Liveness: false when the loop has stalled; the orchestrator restarts the container. */
  isLive: () => boolean;
  /** Readiness: each named dependency, checked on request. */
  checks: readonly { name: string; check: () => Promise<void> }[];
  timeoutMs: number;
}

function withTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timeout'));
    }, timeoutMs);
    work.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('failed'));
      },
    );
  });
}

/**
 * The worker takes no traffic: this port only answers the orchestrator's probes. Like the
 * API's, the answers name dependencies and up/down, never hosts, versions or error text.
 */
export function createHealthServer(options: HealthOptions): Server {
  return createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') {
      send(405, { status: 'method_not_allowed' });
      return;
    }
    if (req.url === '/health/live') {
      if (options.isLive()) send(200, { status: 'live' });
      else send(503, { status: 'stalled' });
      return;
    }
    if (req.url === '/health/ready') {
      void Promise.all(
        options.checks.map(async ({ name, check }) => {
          try {
            await withTimeout(check(), options.timeoutMs);
            return [name, 'up'] as const;
          } catch {
            return [name, 'down'] as const;
          }
        }),
      ).then((results) => {
        const ready = results.every(([, state]) => state === 'up');
        send(ready ? 200 : 503, {
          status: ready ? 'ready' : 'not_ready',
          checks: Object.fromEntries(results),
        });
      });
      return;
    }
    send(404, { status: 'not_found' });
  });
}
