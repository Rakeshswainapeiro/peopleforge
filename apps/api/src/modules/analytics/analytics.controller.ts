import { Controller, Get, Header, Inject, Query, Req, StreamableFile } from '@nestjs/common';
import {
  AnalyticsQuerySchema,
  TatReportQuerySchema,
  type IncrementAnalytics,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { ANALYTICS_SERVICE } from '../../bootstrap/tokens.js';
import { attachmentDisposition } from '../../http/content-disposition.js';
import type { AnalyticsService } from './analytics.service.js';

/** TAT and back-and-forth for Sirius HR (R1-11, R1-12; DASH-D3, DASH-D4). */
@Controller(`${API_V1}/analytics`)
export class AnalyticsController {
  constructor(@Inject(ANALYTICS_SERVICE) private readonly service: AnalyticsService) {}

  @Get('increments')
  @RequirePermission('report:read_operational')
  increments(@Req() req: IncomingMessage, @Query() query: unknown): Promise<IncrementAnalytics> {
    return this.service.increments(principal.require(req), AnalyticsQuerySchema.parse(query));
  }
}

/** RP-02 as Excel (R1-14): audited, never cached. */
@Controller(`${API_V1}/reports`)
export class TatReportController {
  constructor(@Inject(ANALYTICS_SERVICE) private readonly service: AnalyticsService) {}

  @Get('tat-back-and-forth')
  @RequirePermission('report:read_operational')
  @Header('Cache-Control', 'private, no-store')
  async report(@Req() req: IncomingMessage, @Query() query: unknown): Promise<StreamableFile> {
    const file = await this.service.tatReport(
      principal.require(req),
      TatReportQuerySchema.parse(query),
    );
    return new StreamableFile(file.body, {
      type: file.contentType,
      length: file.body.length,
      disposition: attachmentDisposition(file.fileName),
    });
  }
}
