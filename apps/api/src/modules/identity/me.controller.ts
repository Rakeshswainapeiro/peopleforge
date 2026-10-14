import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { EntityDirectory, EntitySummary } from '@peopleforge/db';
import type { IncomingMessage } from 'node:http';
import type { Logger } from 'pino';
import type { Permission } from '@peopleforge/contracts';
import { Authenticated } from '../../auth/policy.js';
import {
  permissionsOfPrincipal,
  principal,
  scopeOf,
  type Principal,
} from '../../auth/principal.js';
import { errorName } from '../../auth/token-resolver.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { ENTITY_DIRECTORY, LOGGER } from '../../bootstrap/tokens.js';
import { DependencyUnavailableError } from '../../errors/domain-errors.js';

export type MeResponse = Principal & { permissions: Permission[]; entities: EntitySummary[] };

/**
 * GET /api/v1/me — the caller's identity, data scope, the subsidiaries they can see and their
 * effective permissions. The web app uses it to decide what to show; every action is still
 * re-authorised server-side (R1-01, R2-12).
 */
@Controller(`${API_V1}/me`)
export class MeController {
  constructor(
    @Inject(ENTITY_DIRECTORY) private readonly directory: Pick<EntityDirectory, 'entities'>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Get()
  @Authenticated()
  async me(@Req() req: IncomingMessage): Promise<MeResponse> {
    // require() throws 401 if the authentication middleware was ever mis-wired.
    const caller = principal.require(req);
    let entities: EntitySummary[];
    try {
      // Row-Level Security decides which entities come back, not this code.
      entities = await this.directory.entities(scopeOf(caller));
    } catch (error: unknown) {
      this.logger.error({ errorName: errorName(error) }, 'Entity directory unavailable');
      throw new DependencyUnavailableError('Entity directory unavailable');
    }
    return { ...caller, permissions: [...permissionsOfPrincipal(caller)].sort(), entities };
  }
}
