import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  EmployeeQuerySchema,
  ExtractQuerySchema,
  FileLocaleQuerySchema,
  FlagQuerySchema,
  MAX_UPLOAD_MB,
  PublishTemplateSchema,
  RuleCodeSchema,
  UpdateFlagSchema,
  UpdateRuleSchema,
  UploadFieldsSchema,
  UploadQuerySchema,
  type AnomalyRule,
  type EmployeeHistory,
  type EmployeePage,
  type FieldTemplate,
  type Flag,
  type FlagDetail,
  type FlagPage,
  type UploadDetail,
  type UploadPage,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { DATA_QUALITY_SERVICE, GROUP_DATA_SERVICE } from '../../bootstrap/tokens.js';
import { attachmentDisposition } from '../../http/content-disposition.js';
import { Id } from '../increment-requests/increment-requests.controller.js';
import type { DataQualityService } from './data-quality.service.js';
import type { GroupDataService, GroupFile, UploadedFile as Upload } from './group-data.service.js';

/**
 * Multipart limits: one `file` part and the two fields, nothing else; kept in memory (never on
 * the API's disk), ≤ MAX_UPLOAD_MB. UTF-8 file names (Arabic) are decoded.
 */
const uploadOptions = {
  defParamCharset: 'utf8',
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
    fieldSize: 64,
    fieldNameSize: 32,
    headerPairs: 20,
  },
};

function download(file: GroupFile): StreamableFile {
  return new StreamableFile(file.body, {
    type: file.contentType,
    length: file.body.length,
    disposition: attachmentDisposition(file.fileName),
  });
}

/**
 * Group-level employee data (R2-01 … R2-04, R2-08 … R2-14). Reading needs `employee_data:read`
 * (subsidiary HR see their own subsidiaries only, by Row-Level Security); uploading
 * `employee_data:upload`; the raw extract `employee_data:extract_raw`; working flags
 * `anomaly:resolve`. The guard runs before a multipart body is read.
 */
@Controller(`${API_V1}/group`)
export class GroupDataController {
  constructor(
    @Inject(GROUP_DATA_SERVICE) private readonly service: GroupDataService,
    @Inject(DATA_QUALITY_SERVICE) private readonly quality: DataQualityService,
  ) {}

  @Get('template')
  @RequirePermission('employee_data:read')
  template(@Req() req: IncomingMessage): Promise<FieldTemplate> {
    return this.service.template(principal.require(req));
  }

  @Get('template/file')
  @RequirePermission('employee_data:read')
  @Header('Cache-Control', 'private, no-store')
  async templateFile(
    @Req() req: IncomingMessage,
    @Query() query: unknown,
  ): Promise<StreamableFile> {
    const { locale } = FileLocaleQuerySchema.parse(query);
    return download(await this.service.templateFile(principal.require(req), locale));
  }

  @Post('uploads')
  @RequirePermission('employee_data:upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(
    @Req() req: IncomingMessage,
    @Body() body: unknown,
    @UploadedFile() file: Upload | undefined,
  ): Promise<UploadDetail> {
    return this.service.upload(principal.require(req), UploadFieldsSchema.parse(body), file);
  }

  @Get('uploads')
  @RequirePermission('employee_data:read')
  uploads(@Req() req: IncomingMessage, @Query() query: unknown): Promise<UploadPage> {
    return this.service.uploads(principal.require(req), UploadQuerySchema.parse(query));
  }

  @Get('uploads/:id')
  @RequirePermission('employee_data:read')
  uploadDetail(@Req() req: IncomingMessage, @Param('id') id: string): Promise<UploadDetail> {
    return this.service.uploadDetail(principal.require(req), Id.parse(id));
  }

  @Get('uploads/:id/issues')
  @RequirePermission('employee_data:read')
  @Header('Cache-Control', 'private, no-store')
  async issues(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<StreamableFile> {
    const { locale } = FileLocaleQuerySchema.parse(query);
    return download(await this.service.issuesFile(principal.require(req), Id.parse(id), locale));
  }

  @Get('uploads/:id/file')
  @RequirePermission('employee_data:read')
  @Header('Cache-Control', 'private, no-store')
  async original(@Req() req: IncomingMessage, @Param('id') id: string): Promise<StreamableFile> {
    return download(await this.service.originalFile(principal.require(req), Id.parse(id)));
  }

  @Get('employees')
  @RequirePermission('employee_data:read')
  employees(@Req() req: IncomingMessage, @Query() query: unknown): Promise<EmployeePage> {
    return this.service.employees(principal.require(req), EmployeeQuerySchema.parse(query));
  }

  @Get('employees/:id/history')
  @RequirePermission('employee_data:read')
  history(@Req() req: IncomingMessage, @Param('id') id: string): Promise<EmployeeHistory> {
    return this.service.history(principal.require(req), Id.parse(id));
  }

  @Get('extract')
  @RequirePermission('employee_data:extract_raw')
  @Header('Cache-Control', 'private, no-store')
  async extract(@Req() req: IncomingMessage, @Query() query: unknown): Promise<StreamableFile> {
    return download(
      await this.service.extract(principal.require(req), ExtractQuerySchema.parse(query)),
    );
  }

  @Get('flags')
  @RequirePermission('employee_data:read')
  flags(@Req() req: IncomingMessage, @Query() query: unknown): Promise<FlagPage> {
    return this.quality.flags(principal.require(req), FlagQuerySchema.parse(query));
  }

  @Get('flags/:id')
  @RequirePermission('employee_data:read')
  flag(@Req() req: IncomingMessage, @Param('id') id: string): Promise<FlagDetail> {
    return this.quality.flag(principal.require(req), Id.parse(id));
  }

  @Patch('flags/:id')
  @RequirePermission('anomaly:resolve')
  updateFlag(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<Flag> {
    return this.quality.updateFlag(
      principal.require(req),
      Id.parse(id),
      UpdateFlagSchema.parse(body),
    );
  }

  @Post('flags/:id/remind')
  @HttpCode(204)
  @RequirePermission('anomaly:resolve')
  async remind(@Req() req: IncomingMessage, @Param('id') id: string): Promise<void> {
    await this.quality.remind(principal.require(req), Id.parse(id));
  }
}

/** Group data settings (R2-02, R2-10, NFR-CFG-01): admins with `template:configure`. */
@Controller(`${API_V1}/settings`)
export class GroupSettingsController {
  constructor(
    @Inject(GROUP_DATA_SERVICE) private readonly service: GroupDataService,
    @Inject(DATA_QUALITY_SERVICE) private readonly quality: DataQualityService,
  ) {}

  @Get('template')
  @RequirePermission('template:configure')
  template(@Req() req: IncomingMessage): Promise<FieldTemplate> {
    return this.service.template(principal.require(req));
  }

  @Put('template')
  @RequirePermission('template:configure')
  publish(@Req() req: IncomingMessage, @Body() body: unknown): Promise<FieldTemplate> {
    return this.service.publishTemplate(principal.require(req), PublishTemplateSchema.parse(body));
  }

  @Get('anomaly-rules')
  @RequirePermission('template:configure')
  rules(@Req() req: IncomingMessage): Promise<AnomalyRule[]> {
    return this.quality.rules(principal.require(req));
  }

  @Put('anomaly-rules/:code')
  @RequirePermission('template:configure')
  updateRule(
    @Req() req: IncomingMessage,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<AnomalyRule> {
    return this.quality.updateRule(
      principal.require(req),
      RuleCodeSchema.parse(code),
      UpdateRuleSchema.parse(body),
    );
  }
}
