import { RequestDataError } from '@peopleforge/db';
import { IntegrationError } from '@peopleforge/integrations';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  PayloadTooLargeError,
  ValidationError,
} from '../../errors/domain-errors.js';
import { SUB_A } from '../../test-support/factory.js';
import {
  alphaHr,
  CRITERION_1,
  CRITERION_IDS,
  EVIDENCE_ID,
  evidenceRecord,
  LINE_1,
  LINE_2,
  memoryObjectStore,
  record,
  REQUEST_ID,
  reviewer,
  SAMPLE_PDF,
  SAMPLE_PNG,
  stubScanner,
  workingRepository,
} from '../../test-support/increment-requests.js';
import { IncrementRequestService } from '../increment-requests/increment-request.service.js';
import { EvidenceService } from './evidence.service.js';

const NOW = new Date('2026-10-14T08:00:00Z');
const C2 = String(CRITERION_IDS[1]);

function setup() {
  const repository = workingRepository();
  const store = memoryObjectStore();
  const scanner = stubScanner();
  const logger = pino({ level: 'silent' });
  const warn = vi.spyOn(logger, 'warn');
  const error = vi.spyOn(logger, 'error');
  const info = vi.spyOn(logger, 'info');
  const service = new EvidenceService({
    requests: new IncrementRequestService(repository),
    repository,
    store,
    scanner,
    logger,
    now: () => NOW,
  });
  return { repository, store, scanner, service, warn, error, info };
}

const pdf = (originalname = 'Appraisal 2026.pdf') => ({ buffer: SAMPLE_PDF, originalname });

describe('EvidenceService.upload [R1-04]', () => {
  it('scans, stores under a random key and records a clean file', async () => {
    const { repository, store, scanner, service } = setup();
    const saved = await service.upload(
      alphaHr,
      REQUEST_ID,
      { lineId: LINE_2, criterionId: C2 },
      pdf('../../C:\\fake\\path\\تقييم "2026".pdf'),
    );
    expect(scanner.scan).toHaveBeenCalledWith(SAMPLE_PDF);
    const [key, body, mediaType] = store.put.mock.calls[0] ?? [];
    expect(String(key).startsWith(`evidence/${SUB_A}/`)).toBe(true);
    expect([body, mediaType]).toEqual([SAMPLE_PDF, 'application/pdf']);
    expect(repository.addEvidence).toHaveBeenCalledWith(
      { userId: 'alpha', kind: 'entity', entityIds: [SUB_A] },
      REQUEST_ID,
      expect.objectContaining({
        lineId: LINE_2,
        criterionId: C2,
        objectKey: key,
        fileName: 'تقييم 2026.pdf',
        mediaType: 'application/pdf',
        sizeBytes: SAMPLE_PDF.length,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) as unknown,
        scanEngine: 'stub',
        scannedAt: NOW,
      }),
    );
    expect(saved).toMatchObject({ fileName: 'تقييم 2026.pdf', createdAt: NOW.toISOString() });
    expect(key).toBe(`evidence/${SUB_A}/${saved.id}`);
  });

  it('refuses a request the caller cannot see, before reading the file', async () => {
    const { scanner, service } = setup();
    await expect(
      service.upload(reviewer, REQUEST_ID, { lineId: LINE_1, criterionId: CRITERION_1 }, pdf()),
    ).rejects.toThrow(NotFoundError);
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('refuses an unknown employee line or criterion', async () => {
    const { service } = setup();
    await expect(
      service.upload(alphaHr, REQUEST_ID, { lineId: EVIDENCE_ID, criterionId: C2 }, pdf()),
    ).rejects.toMatchObject({ details: [{ path: 'lineId', code: 'not_found' }] });
    await expect(
      service.upload(alphaHr, REQUEST_ID, { lineId: LINE_1, criterionId: EVIDENCE_ID }, pdf()),
    ).rejects.toMatchObject({ details: [{ path: 'criterionId', code: 'not_found' }] });
  });

  it('refuses files for a criterion configured to take none', async () => {
    const { repository, service } = setup();
    const noFiles = record();
    noFiles.criteria = noFiles.criteria.map((c) => ({ ...c, evidencePolicy: 'none' as const }));
    repository.get.mockResolvedValue(noFiles);
    await expect(
      service.upload(alphaHr, REQUEST_ID, { lineId: LINE_1, criterionId: C2 }, pdf()),
    ).rejects.toMatchObject({ details: [{ path: 'criterionId', code: 'no_evidence' }] });
  });

  it('refuses a sixth file without scanning it', async () => {
    const { repository, scanner, service } = setup();
    const full = record();
    const [omar] = full.lines;
    if (omar === undefined) throw new Error('fixture');
    omar.criteria = [
      {
        criterionId: CRITERION_1,
        result: 'pass',
        justification: 'x',
        evidence: [0, 1, 2, 3, 4].map(() => evidenceRecord),
      },
    ];
    repository.get.mockResolvedValue(full);
    await expect(
      service.upload(alphaHr, REQUEST_ID, { lineId: LINE_1, criterionId: CRITERION_1 }, pdf()),
    ).rejects.toThrow(ConflictError);
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('needs a non-empty file', async () => {
    const { service } = setup();
    const fields = { lineId: LINE_1, criterionId: C2 };
    for (const file of [undefined, { buffer: Buffer.alloc(0), originalname: 'empty.pdf' }]) {
      await expect(service.upload(alphaHr, REQUEST_ID, fields, file)).rejects.toMatchObject({
        details: [{ path: 'file', code: 'required' }],
      });
    }
  });

  it('applies the criterion’s own size limit', async () => {
    const { repository, service } = setup();
    const small = record();
    small.criteria = small.criteria.map((c) => ({ ...c, maxFileMb: 1 }));
    repository.get.mockResolvedValue(small);
    const big = Buffer.concat([SAMPLE_PDF, Buffer.alloc(1024 * 1024)]);
    await expect(
      service.upload(
        alphaHr,
        REQUEST_ID,
        { lineId: LINE_1, criterionId: C2 },
        {
          buffer: big,
          originalname: 'big.pdf',
        },
      ),
    ).rejects.toThrow(PayloadTooLargeError);
  });

  it('judges the type by content, not by name, against the criterion’s list', async () => {
    const { repository, service } = setup();
    const fields = { lineId: LINE_1, criterionId: C2 };
    const disguised = { buffer: Buffer.from('<script>alert(1)</script>'), originalname: 'x.pdf' };
    await expect(service.upload(alphaHr, REQUEST_ID, fields, disguised)).rejects.toMatchObject({
      details: [{ path: 'file', code: 'media_type' }],
    });
    const pdfOnly = record();
    pdfOnly.criteria = pdfOnly.criteria.map((c) => ({
      ...c,
      allowedMediaTypes: ['application/pdf'],
    }));
    repository.get.mockResolvedValue(pdfOnly);
    await expect(
      service.upload(alphaHr, REQUEST_ID, fields, { buffer: SAMPLE_PNG, originalname: 'a.pdf' }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses an infected file, stores nothing and logs the event without the file name', async () => {
    const { store, service, warn } = setup();
    const infected = Buffer.concat([SAMPLE_PDF, Buffer.from('INFECTED')]);
    await expect(
      service.upload(
        alphaHr,
        REQUEST_ID,
        { lineId: LINE_1, criterionId: C2 },
        {
          buffer: infected,
          originalname: 'Omar Haddad payslip.pdf',
        },
      ),
    ).rejects.toMatchObject({ details: [{ path: 'file', code: 'infected' }] });
    expect(store.put).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'evidence_infected', signature: 'Stub-Test-Signature' }),
      'Infected upload refused',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Omar');
  });

  it('answers 503 when the scanner or the store is unavailable, storing nothing', async () => {
    const { scanner, store, service } = setup();
    const fields = { lineId: LINE_1, criterionId: C2 };
    scanner.scan.mockRejectedValueOnce(new IntegrationError('malware_scanner', 'Timeout'));
    await expect(service.upload(alphaHr, REQUEST_ID, fields, pdf())).rejects.toThrow(
      DependencyUnavailableError,
    );
    expect(store.put).not.toHaveBeenCalled();
    store.put.mockRejectedValueOnce(new IntegrationError('object_store', 'TimeoutError'));
    await expect(service.upload(alphaHr, REQUEST_ID, fields, pdf())).rejects.toThrow(
      DependencyUnavailableError,
    );
  });

  it('passes unexpected scanner failures through', async () => {
    const { scanner, service } = setup();
    scanner.scan.mockRejectedValueOnce(new Error('bug'));
    await expect(
      service.upload(alphaHr, REQUEST_ID, { lineId: LINE_1, criterionId: C2 }, pdf()),
    ).rejects.toThrow('bug');
  });

  it('removes the stored object when recording fails', async () => {
    const { repository, store, service } = setup();
    repository.addEvidence.mockRejectedValueOnce(new RequestDataError('evidence_limit', C2));
    await expect(
      service.upload(alphaHr, REQUEST_ID, { lineId: LINE_1, criterionId: C2 }, pdf()),
    ).rejects.toThrow(ConflictError);
    expect(store.remove).toHaveBeenCalledOnce();
    expect(store.objects.size).toBe(0);
  });

  it('logs an object it could not remove, and still reports the original failure', async () => {
    const { repository, store, service, error } = setup();
    repository.addEvidence.mockRejectedValueOnce(new Error('connection lost'));
    store.remove.mockRejectedValueOnce(new IntegrationError('object_store', 'TimeoutError'));
    await expect(
      service.upload(alphaHr, REQUEST_ID, { lineId: LINE_1, criterionId: C2 }, pdf()),
    ).rejects.toThrow('connection lost');
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'evidence_orphaned' }),
      'Orphaned object',
    );
  });
});

describe('EvidenceService.download [R1-04, NFR-SEC-01]', () => {
  it('returns the stored file and logs who downloaded it', async () => {
    const { store, service, info } = setup();
    store.objects.set(`evidence/${SUB_A}/${EVIDENCE_ID}`, SAMPLE_PDF);
    await expect(service.download(alphaHr, REQUEST_ID, EVIDENCE_ID)).resolves.toEqual({
      body: SAMPLE_PDF,
      fileName: 'appraisal-2026.pdf',
      mediaType: 'application/pdf',
    });
    expect(info).toHaveBeenCalledWith(
      {
        event: 'evidence_downloaded',
        userId: 'alpha',
        requestId: REQUEST_ID,
        evidenceId: EVIDENCE_ID,
      },
      'Evidence downloaded',
    );
  });

  it('answers not found outside the caller’s scope and for drafts Sirius cannot see yet', async () => {
    const { repository, service } = setup();
    await expect(service.download(reviewer, REQUEST_ID, EVIDENCE_ID)).rejects.toThrow(
      NotFoundError,
    );
    repository.getEvidence.mockResolvedValueOnce(null);
    await expect(service.download(alphaHr, REQUEST_ID, EVIDENCE_ID)).rejects.toThrow(NotFoundError);
  });

  it('answers 503 when storage is unavailable', async () => {
    const { store, service } = setup();
    store.get.mockRejectedValueOnce(new IntegrationError('object_store', 'TimeoutError'));
    await expect(service.download(alphaHr, REQUEST_ID, EVIDENCE_ID)).rejects.toThrow(
      DependencyUnavailableError,
    );
  });
});

describe('EvidenceService.remove', () => {
  it('soft-deletes through the repository and maps its refusals', async () => {
    const { repository, service } = setup();
    await service.remove(alphaHr, REQUEST_ID, EVIDENCE_ID);
    expect(repository.removeEvidence).toHaveBeenCalledWith(
      { userId: 'alpha', kind: 'entity', entityIds: [SUB_A] },
      REQUEST_ID,
      EVIDENCE_ID,
    );
    repository.removeEvidence.mockRejectedValueOnce(
      new RequestDataError('evidence_not_found', EVIDENCE_ID),
    );
    await expect(service.remove(alphaHr, REQUEST_ID, EVIDENCE_ID)).rejects.toThrow(NotFoundError);
  });
});
