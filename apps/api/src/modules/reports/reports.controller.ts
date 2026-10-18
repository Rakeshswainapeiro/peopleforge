import { Controller, Get, Header, Inject, Query, Req, StreamableFile } from '@nestjs/common';
import { IncrementReportQuerySchema } from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { attachmentDisposition } from '../../http/content-disposition.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { REPORT_SERVICE } from '../../bootstrap/tokens.js';
import type { ReportService } from './report.service.js';

/** Reports (R1-14): files for subsidiary HR and Sirius HR (`report:read_operational`). */
@Controller(`${API_V1}/reports`)
export class ReportsController {
  constructor(@Inject(REPORT_SERVICE) private readonly service: ReportService) {}

  /** RP-01, the increment status report, as `xlsx` or `pdf`; every download is audited. */
  @Get('increment-requests')
  @RequirePermission('report:read_operational')
  @Header('Cache-Control', 'private, no-store')
  async increments(@Req() req: IncomingMessage, @Query() query: unknown): Promise<StreamableFile> {
    const file = await this.service.incrementReport(
      principal.require(req),
      IncrementReportQuerySchema.parse(query),
    );
    return new StreamableFile(file.body, {
      type: file.contentType,
      length: file.body.length,
      disposition: attachmentDisposition(file.fileName),
    });
  }
}
