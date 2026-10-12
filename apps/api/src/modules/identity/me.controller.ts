import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { permissionsFor, type Permission } from '../../auth/permissions.js';
import { Authenticated } from '../../auth/policy.js';
import type { Principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { UnauthenticatedError } from '../../errors/domain-errors.js';
import { getPrincipal } from '../../http/locals.js';

export type MeResponse = Principal & { permissions: Permission[] };

/**
 * GET /api/v1/me — the caller's identity, data scope and effective permissions. The web app
 * uses it to decide what to show; every action is still re-authorised server-side
 * (R1-01, R2-12).
 */
@Controller(`${API_V1}/me`)
export class MeController {
  @Get()
  @Authenticated()
  me(@Res({ passthrough: true }) res: Response): MeResponse {
    const principal = getPrincipal(res);
    if (principal === undefined) {
      // Defence in depth: only reachable if the middleware is mis-wired.
      throw new UnauthenticatedError('Authentication required');
    }
    return { ...principal, permissions: [...permissionsFor(principal.roles)].sort() };
  }
}
