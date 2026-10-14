import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  EvidenceUploadSchema,
  MAX_EVIDENCE_FILE_MB,
  type EvidenceFile,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { EVIDENCE_SERVICE } from '../../bootstrap/tokens.js';
import { attachmentDisposition } from '../../http/content-disposition.js';
import { Id } from '../increment-requests/increment-requests.controller.js';
import type { EvidenceService, UploadedFile as Upload } from './evidence.service.js';

/**
 * Multipart limits: one file part named `file` and the two ID fields, nothing else. No `dest`
 * or `storage`, so multer keeps the file in memory (≤ MAX_EVIDENCE_FILE_MB): it is never
 * written to the API's disk. Busboy decodes UTF-8 file names (browsers send them raw), so
 * Arabic names survive.
 */
const uploadOptions = {
  defParamCharset: 'utf8',
  limits: {
    fileSize: MAX_EVIDENCE_FILE_MB * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
    fieldSize: 64,
    fieldNameSize: 32,
    headerPairs: 20,
  },
};

/**
 * Evidence files of an increment request (R1-04). Uploading and removing need
 * `increment_request:create` (subsidiary HR, on drafts); downloading needs
 * `increment_request:read`. The guard runs before the multipart body is read, so an
 * unauthorised caller's file is never parsed.
 */
@Controller(`${API_V1}/increment-requests/:id/evidence`)
export class EvidenceController {
  constructor(@Inject(EVIDENCE_SERVICE) private readonly service: EvidenceService) {}

  @Post()
  @RequirePermission('increment_request:create')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Body() body: unknown,
    @UploadedFile() file: Upload | undefined,
  ): Promise<EvidenceFile> {
    return this.service.upload(
      principal.require(req),
      Id.parse(id),
      EvidenceUploadSchema.parse(body),
      file,
    );
  }

  @Get(':evidenceId')
  @RequirePermission('increment_request:read')
  @Header('Cache-Control', 'private, no-store')
  async download(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ): Promise<StreamableFile> {
    const file = await this.service.download(
      principal.require(req),
      Id.parse(id),
      Id.parse(evidenceId),
    );
    return new StreamableFile(file.body, {
      type: file.mediaType,
      length: file.body.length,
      disposition: attachmentDisposition(file.fileName),
    });
  }

  @Delete(':evidenceId')
  @HttpCode(204)
  @RequirePermission('increment_request:create')
  async remove(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ): Promise<void> {
    await this.service.remove(principal.require(req), Id.parse(id), Id.parse(evidenceId));
  }
}
