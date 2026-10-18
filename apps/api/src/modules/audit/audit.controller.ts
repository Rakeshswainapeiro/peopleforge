import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import {
  AuditTrailQuerySchema,
  type AuditEvent,
  type AuditTrailPage,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { AUDIT_SERVICE } from '../../bootstrap/tokens.js';
import { Id } from '../increment-requests/increment-requests.controller.js';
import type { AuditService } from './audit.service.js';

/** A request's history (R1-15): whoever may read the request. */
@Controller(`${API_V1}/increment-requests`)
export class RequestHistoryController {
  constructor(@Inject(AUDIT_SERVICE) private readonly service: AuditService) {}

  @Get(':id/history')
  @RequirePermission('increment_request:read')
  history(@Req() req: IncomingMessage, @Param('id') id: string): Promise<AuditEvent[]> {
    return this.service.requestHistory(principal.require(req), Id.parse(id));
  }
}

/** The whole audit trail, per user and dates (R1-15): `audit:read` only. */
@Controller(`${API_V1}/audit`)
export class AuditTrailController {
  constructor(@Inject(AUDIT_SERVICE) private readonly service: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  list(@Req() req: IncomingMessage, @Query() query: unknown): Promise<AuditTrailPage> {
    return this.service.trail(principal.require(req), AuditTrailQuerySchema.parse(query));
  }
}
