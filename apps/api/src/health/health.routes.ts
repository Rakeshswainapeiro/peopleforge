import { Router } from 'express';
import type { LivenessResponse } from '@sirius-hr/shared-types';
import { evaluateReadiness, type ReadinessCheck } from './readiness.js';

export interface HealthRouterOptions {
  checks: readonly ReadinessCheck[];
  timeoutMs: number;
  isShuttingDown: () => boolean;
}

/**
 * Unauthenticated by design: probes come from the orchestrator. Responses expose only
 * dependency names and up/down, never versions, hosts or error text.
 */
export function healthRouter({ checks, timeoutMs, isShuttingDown }: HealthRouterOptions): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    const body: LivenessResponse = { status: 'alive' };
    res.json(body);
  });

  router.get('/ready', async (_req, res) => {
    if (isShuttingDown()) {
      res.status(503).json({ status: 'not_ready', checks: {} });
      return;
    }
    const result = await evaluateReadiness(checks, timeoutMs);
    res.status(result.status === 'ready' ? 200 : 503).json(result);
  });

  return router;
}
