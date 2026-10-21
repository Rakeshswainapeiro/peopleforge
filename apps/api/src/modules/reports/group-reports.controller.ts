import { Controller, Get, Header, Inject, Query, Req, StreamableFile } from '@nestjs/common';
import { GroupReportQuerySchema, type GroupReportCode } from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { GROUP_REPORT_SERVICE } from '../../bootstrap/tokens.js';
import { attachmentDisposition } from '../../http/content-disposition.js';
import type { GroupReportService } from './group-report.service.js';
import type { ReportFile } from './report.service.js';

function file(report: ReportFile): StreamableFile {
  return new StreamableFile(report.body, {
    type: report.contentType,
    length: report.body.length,
    disposition: attachmentDisposition(report.fileName),
  });
}

/**
 * Group HR reports (R2-06, R2-07) as files, one route per report so each states its permission:
 * RP-03 and RP-05 need employee data, RP-04 compensation access, RP-06 and RP-07 executive
 * reporting (Sirius only). Never cached; every download is audited.
 */
@Controller(`${API_V1}/reports`)
export class GroupReportsController {
  constructor(@Inject(GROUP_REPORT_SERVICE) private readonly service: GroupReportService) {}

  private async send(
    req: IncomingMessage,
    code: GroupReportCode,
    query: unknown,
  ): Promise<StreamableFile> {
    return file(
      await this.service.report(principal.require(req), code, GroupReportQuerySchema.parse(query)),
    );
  }

  /** RP-03 Headcount & demographics, monthly. */
  @Get('rp-03')
  @RequirePermission('employee_data:read')
  @Header('Cache-Control', 'private, no-store')
  rp03(@Req() req: IncomingMessage, @Query() query: unknown): Promise<StreamableFile> {
    return this.send(req, 'rp-03', query);
  }

  /** RP-04 Compensation & increment summary, monthly. */
  @Get('rp-04')
  @RequirePermission('employee_data:read_compensation')
  @Header('Cache-Control', 'private, no-store')
  rp04(@Req() req: IncomingMessage, @Query() query: unknown): Promise<StreamableFile> {
    return this.send(req, 'rp-04', query);
  }

  /** RP-05 Data quality & anomalies, monthly. */
  @Get('rp-05')
  @RequirePermission('employee_data:read')
  @Header('Cache-Control', 'private, no-store')
  rp05(@Req() req: IncomingMessage, @Query() query: unknown): Promise<StreamableFile> {
    return this.send(req, 'rp-05', query);
  }

  /** RP-06 Quarterly group HR review (PDF). */
  @Get('rp-06')
  @RequirePermission('report:read_executive')
  @Header('Cache-Control', 'private, no-store')
  rp06(@Req() req: IncomingMessage, @Query() query: unknown): Promise<StreamableFile> {
    return this.send(req, 'rp-06', query);
  }

  /** RP-07 Annual HR report (PDF). */
  @Get('rp-07')
  @RequirePermission('report:read_executive')
  @Header('Cache-Control', 'private, no-store')
  rp07(@Req() req: IncomingMessage, @Query() query: unknown): Promise<StreamableFile> {
    return this.send(req, 'rp-07', query);
  }
}
