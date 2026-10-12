import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { LivenessResponse, ReadinessResponse } from '@sirius-hr/shared-types';
import { Public } from '../auth/policy.js';
import type { Env } from '../config/env.js';
import { ENV, READINESS_CHECKS, SHUTDOWN_STATE, type ShutdownState } from '../bootstrap/tokens.js';
import { evaluateReadiness, type ReadinessCheck } from './readiness.js';

/**
 * Unauthenticated by design: probes come from the orchestrator. Responses expose only
 * dependency names and up/down, never versions, hosts or error text.
 */
@Controller('health')
@Public()
export class HealthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(READINESS_CHECKS) private readonly checks: readonly ReadinessCheck[],
    @Inject(SHUTDOWN_STATE) private readonly shutdown: ShutdownState,
  ) {}

  @Get('live')
  live(): LivenessResponse {
    return { status: 'alive' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    if (this.shutdown.isShuttingDown()) {
      res.status(503);
      return { status: 'not_ready', checks: {} };
    }
    const result = await evaluateReadiness(this.checks, this.env.READINESS_CHECK_TIMEOUT_MS);
    res.status(result.status === 'ready' ? 200 : 503);
    return result;
  }
}
