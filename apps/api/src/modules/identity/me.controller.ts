import { Controller, Get, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { Permission } from '../../auth/permissions.js';
import { Authenticated } from '../../auth/policy.js';
import { permissionsOfPrincipal, principal, type Principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';

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
  me(@Req() req: IncomingMessage): MeResponse {
    // require() throws 401 if the authentication middleware was ever mis-wired.
    const caller = principal.require(req);
    return { ...caller, permissions: [...permissionsOfPrincipal(caller)].sort() };
  }
}
