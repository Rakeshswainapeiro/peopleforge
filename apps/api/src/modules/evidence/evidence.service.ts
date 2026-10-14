import { randomUUID, createHash } from 'node:crypto';
import {
  MAX_EVIDENCE_PER_CRITERION,
  type EvidenceFile,
  type EvidenceUpload,
} from '@peopleforge/contracts';
import type { IncrementRequestRepository } from '@peopleforge/db';
import {
  detectMediaType,
  IntegrationError,
  safeFileName,
  type MalwareScanner,
  type ObjectStore,
} from '@peopleforge/integrations';
import type { Logger } from 'pino';
import { scopeOf, type Principal } from '../../auth/principal.js';
import {
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  PayloadTooLargeError,
  ValidationError,
} from '../../errors/domain-errors.js';
import {
  canSee,
  guard,
  type IncrementRequestService,
} from '../increment-requests/increment-request.service.js';

/** The part of a multipart file the service needs (multer memory storage). */
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}

export interface EvidenceDownload {
  body: Buffer;
  fileName: string;
  mediaType: string;
}

export interface EvidenceDependencies {
  requests: IncrementRequestService;
  repository: IncrementRequestRepository;
  store: ObjectStore;
  scanner: MalwareScanner;
  logger: Logger;
  now?: () => Date;
}

const MB = 1024 * 1024;

/**
 * Evidence files per employee and criterion (R1-04). An upload is checked in this order, and
 * nothing is stored until every check passes: request visible to the caller → employee and
 * criterion in the request → criterion takes files → file count → size → type from the content
 * (magic bytes) → malware scan → store → record. Downloads re-check visibility on every call
 * (ADR-010): storage is never reachable from a browser.
 */
export class EvidenceService {
  private readonly now: () => Date;

  constructor(private readonly deps: EvidenceDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  async upload(
    caller: Principal,
    requestId: string,
    fields: EvidenceUpload,
    file: UploadedFile | undefined,
  ): Promise<EvidenceFile> {
    const request = await this.deps.requests.get(caller, requestId);
    const line = request.lines.find((candidate) => candidate.id === fields.lineId);
    if (line === undefined) {
      throw new NotFoundError('Request line not found', [{ path: 'lineId', code: 'not_found' }]);
    }
    const criterion = request.criteria.find((candidate) => candidate.id === fields.criterionId);
    if (criterion === undefined) {
      throw new ValidationError('Unknown criterion', [{ path: 'criterionId', code: 'not_found' }]);
    }
    if (criterion.evidencePolicy === 'none') {
      throw new ValidationError('This criterion takes no files', [
        { path: 'criterionId', code: 'no_evidence' },
      ]);
    }
    // Checked again under the request's lock when recording; this spares a pointless scan.
    const held = line.criteria
      .filter((assessment) => assessment.criterionId === criterion.id)
      .flatMap((assessment) => assessment.evidence).length;
    if (held >= MAX_EVIDENCE_PER_CRITERION) {
      throw new ConflictError('Too many files for this criterion', [
        { path: 'file', code: 'limit' },
      ]);
    }
    if (file === undefined || file.buffer.length === 0) {
      throw new ValidationError('Choose a file', [{ path: 'file', code: 'required' }]);
    }
    if (file.buffer.length > criterion.maxFileMb * MB) {
      throw new PayloadTooLargeError('File too large', [{ path: 'file', code: 'too_large' }]);
    }
    const mediaType = await detectMediaType(file.buffer);
    if (mediaType === null || !criterion.allowedMediaTypes.includes(mediaType)) {
      throw new ValidationError('File type not accepted', [{ path: 'file', code: 'media_type' }]);
    }

    const verdict = await this.dependency(this.deps.scanner.scan(file.buffer));
    if (!verdict.clean) {
      // Security event: who and where, never the file name or content.
      this.deps.logger.warn(
        {
          event: 'evidence_infected',
          userId: caller.userId,
          requestId,
          criterionId: criterion.id,
          signature: verdict.signature,
        },
        'Infected upload refused',
      );
      throw new ValidationError('File refused by the malware scan', [
        { path: 'file', code: 'infected' },
      ]);
    }

    const id = randomUUID();
    const objectKey = `evidence/${request.entity.id}/${id}`;
    await this.dependency(this.deps.store.put(objectKey, file.buffer, mediaType));
    try {
      const saved = await guard(
        this.deps.repository.addEvidence(scopeOf(caller), requestId, {
          id,
          lineId: line.id,
          criterionId: criterion.id,
          objectKey,
          fileName: safeFileName(file.originalname),
          mediaType,
          sizeBytes: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          scanEngine: this.deps.scanner.engine,
          scannedAt: this.now(),
        }),
      );
      return { ...saved, createdAt: saved.createdAt.toISOString() };
    } catch (error: unknown) {
      // The record wasn't written, so the object must not linger unreferenced.
      await this.deps.store.remove(objectKey).catch(() => {
        this.deps.logger.error({ event: 'evidence_orphaned', objectKey }, 'Orphaned object');
      });
      throw error;
    }
  }

  async download(
    caller: Principal,
    requestId: string,
    evidenceId: string,
  ): Promise<EvidenceDownload> {
    const location = await this.deps.repository.getEvidence(scopeOf(caller), requestId, evidenceId);
    if (location === null || !canSee(caller, location.requestStatus)) {
      throw new NotFoundError('Evidence not found');
    }
    const body = await this.dependency(this.deps.store.get(location.objectKey));
    // Interim until the audit trail (R1-15): downloads of personal documents are traceable.
    this.deps.logger.info(
      { event: 'evidence_downloaded', userId: caller.userId, requestId, evidenceId },
      'Evidence downloaded',
    );
    return { body, fileName: location.fileName, mediaType: location.mediaType };
  }

  /** Soft delete: the request no longer shows the file; the object stays (retention, Q10). */
  async remove(caller: Principal, requestId: string, evidenceId: string): Promise<void> {
    await guard(this.deps.repository.removeEvidence(scopeOf(caller), requestId, evidenceId));
  }

  /** An unavailable store or scanner is a 503 (retry later), never a 500. */
  private async dependency<T>(work: Promise<T>): Promise<T> {
    try {
      return await work;
    } catch (error: unknown) {
      if (!(error instanceof IntegrationError)) throw error;
      this.deps.logger.warn(
        { event: 'dependency_unavailable', dependency: error.dependency, reason: error.message },
        'Dependency unavailable',
      );
      throw new DependencyUnavailableError('File service unavailable');
    }
  }
}
