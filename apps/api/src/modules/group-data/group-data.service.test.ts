import {
  EmployeeHistorySchema,
  EmployeePageSchema,
  FieldTemplateSchema,
  ROLES,
  UploadDetailSchema,
  UploadPageSchema,
  type PublishTemplate,
} from '@peopleforge/contracts';
import { GroupDataError, type AcceptInput, type ApprovedIncrementRecord } from '@peopleforge/db';
import { IntegrationError } from '@peopleforge/integrations';
import ExcelJS from 'exceljs';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { SUB_A, SUB_B } from '../../test-support/factory.js';
import {
  snapshotRecord,
  TEMPLATE,
  TEMPLATE_HEADERS,
  uploadRecord,
  UPLOAD_ID,
  RECORD_ID,
  VALID_ROW,
  workingDataQuality,
  workingGroupData,
} from '../../test-support/group-data.js';
import {
  alphaHr,
  executive,
  memoryObjectStore,
  reviewer,
  SAMPLE_PDF,
  stubScanner,
} from '../../test-support/increment-requests.js';
import { changesBetween, GroupDataService } from './group-data.service.js';
import { CSV_TYPE } from './spreadsheet.js';

// The group data service (R2-01 … R2-04, R2-08 … R2-10, R2-12 … R2-14) with fake repositories:
// the upload checks in order, rejection without changes, acceptance with comparison and flags,
// files, and what each caller may see.

const NOW = new Date('2026-10-19T08:00:00Z');
const admin: Principal = { ...reviewer, userId: 'admin', roles: [ROLES.admin] };

function setup() {
  const repository = workingGroupData();
  const quality = workingDataQuality();
  const store = memoryObjectStore();
  const scanner = stubScanner();
  const logger = pino({ level: 'silent' });
  const warn = vi.spyOn(logger, 'warn');
  const error = vi.spyOn(logger, 'error');
  const service = new GroupDataService({
    repository,
    quality,
    store,
    scanner,
    logger,
    now: () => NOW,
  });
  return { repository, quality, store, scanner, service, warn, error };
}

const csvFile = (rows: string[][], name = 'employees.csv') => ({
  buffer: Buffer.from(rows.map((row) => row.join(',')).join('\n'), 'utf8'),
  originalname: name,
});
const VALID = csvFile([TEMPLATE_HEADERS, VALID_ROW]);
const fields = { entityId: SUB_A, period: '2026-09' };

async function failure(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => new Error('expected a failure'),
    (reason: unknown) => reason,
  );
  return error as { status: number; details?: { path: string; code: string }[] };
}

function publish(overrides: Partial<PublishTemplate['fields'][number]>[] = []): PublishTemplate {
  return {
    version: 1,
    fields: [
      ...TEMPLATE.fields.map(({ core: _core, ...field }) => ({
        ...field,
        label: { en: field.label.en, ar: undefined },
      })),
      ...overrides.map((override) => ({
        key: 'extra_field',
        label: { en: 'Extra', ar: undefined },
        type: 'text' as const,
        required: false,
        allowedValues: [],
        palmHrField: null,
        ...override,
      })),
    ],
  };
}

describe('template [R2-01, R2-02]', () => {
  it('serves the active template and its Excel file', async () => {
    const { service } = setup();
    expect(FieldTemplateSchema.parse(await service.template(alphaHr)).version).toBe(1);
    const file = await service.templateFile(alphaHr, 'en');
    expect(file.fileName).toBe('PeopleForge-employee-data-template-v1.xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.body as unknown as ArrayBuffer);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Employee data', 'Fields']);
  });

  it('shows a template not yet activated without a date', async () => {
    const { service, repository } = setup();
    repository.activeTemplate.mockResolvedValueOnce({ ...TEMPLATE, activatedAt: null });
    expect((await service.template(admin)).activatedAt).toBeNull();
  });

  it('publishes a valid template, Arabic labels kept, empty ones dropped', async () => {
    const { service, repository } = setup();
    await service.publishTemplate(admin, publish([{ label: { en: 'Extra', ar: 'إضافي' } }]));
    const sent = repository.publishTemplate.mock.calls[0]?.[1] as {
      fields: { key: string; label: unknown }[];
    };
    expect(sent.fields.at(-1)).toMatchObject({
      key: 'extra_field',
      label: { en: 'Extra', ar: 'إضافي' },
    });
    expect(sent.fields[0]?.label).toEqual({ en: 'Employee ID' });
  });

  it('refuses templates the dashboards could not rely on', async () => {
    const { service } = setup();
    const bad = publish([
      { key: 'employee_number', required: true },
      { key: 'grade_band', type: 'enum' },
    ]);
    const changed = bad.fields.map((field) =>
      field.key === 'gross_salary'
        ? { ...field, type: 'text' as const }
        : field.key === 'department'
          ? { ...field, required: false }
          : field,
    );
    const error = await failure(
      service.publishTemplate(admin, {
        version: 1,
        fields: changed.filter((field) => field.key !== 'cost_centre'),
      }),
    );
    expect(error.status).toBe(400);
    expect(error.details?.map((detail) => detail.code)).toEqual([
      'core_required',
      'core_type',
      'duplicate',
      'required',
      'core_missing:cost_centre',
    ]);
  });

  it('maps a stale version to 409 and an unknown template to 404', async () => {
    const { service, repository } = setup();
    repository.publishTemplate.mockRejectedValueOnce(new GroupDataError('version_conflict'));
    expect((await failure(service.publishTemplate(admin, publish()))).status).toBe(409);
    repository.publishTemplate.mockRejectedValueOnce(new GroupDataError('not_found'));
    expect((await failure(service.publishTemplate(admin, publish()))).status).toBe(404);
    repository.publishTemplate.mockRejectedValueOnce(new Error('database down'));
    await expect(service.publishTemplate(admin, publish())).rejects.toThrow('database down');
  });
});

describe('upload checks, in order [R2-01, R2-12, NFR-SEC-01]', () => {
  it('refuses another subsidiary, a future month and a missing or oversized file', async () => {
    const { service, store } = setup();
    expect(
      (await failure(service.upload(alphaHr, { ...fields, entityId: SUB_B }, VALID))).status,
    ).toBe(403);
    const future = await failure(service.upload(alphaHr, { ...fields, period: '2026-11' }, VALID));
    expect(future.details).toEqual([{ path: 'period', code: 'future' }]);
    expect((await failure(service.upload(alphaHr, fields, undefined))).status).toBe(400);
    expect(
      (
        await failure(
          service.upload(alphaHr, fields, { buffer: Buffer.alloc(0), originalname: 'a.csv' }),
        )
      ).details,
    ).toEqual([{ path: 'file', code: 'required' }]);
    const big = { buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0x41), originalname: 'big.csv' };
    expect((await failure(service.upload(alphaHr, fields, big))).status).toBe(413);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('decides the type by content: a PDF named .csv and text not named .csv are refused', async () => {
    const { service } = setup();
    const pdf = await failure(
      service.upload(alphaHr, fields, { buffer: SAMPLE_PDF, originalname: 'data.csv' }),
    );
    expect(pdf.details).toEqual([{ path: 'file', code: 'media_type' }]);
    const text = await failure(
      service.upload(alphaHr, fields, { ...VALID, originalname: 'data.txt' }),
    );
    expect(text.details).toEqual([{ path: 'file', code: 'media_type' }]);
  });

  it('refuses an infected file, logging the event without the file', async () => {
    const { service, store, warn } = setup();
    const infected = csvFile([TEMPLATE_HEADERS, [...VALID_ROW.slice(0, 14), 'INFECTED']]);
    const error = await failure(service.upload(alphaHr, fields, infected));
    expect(error.details).toEqual([{ path: 'file', code: 'infected' }]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'group_upload_infected', entityId: SUB_A }),
      'Infected upload refused',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('employees.csv');
    expect(store.put).not.toHaveBeenCalled();
  });

  it('answers 503 when the scanner or store is down, and rethrows anything else', async () => {
    const { service, scanner, store } = setup();
    scanner.scan.mockRejectedValueOnce(new IntegrationError('malware_scanner', 'Timeout'));
    expect((await failure(service.upload(alphaHr, fields, VALID))).status).toBe(503);
    store.put.mockRejectedValueOnce(new IntegrationError('object_store', 'Timeout'));
    expect((await failure(service.upload(alphaHr, fields, VALID))).status).toBe(503);
    scanner.scan.mockRejectedValueOnce(new Error('bug'));
    await expect(service.upload(alphaHr, fields, VALID)).rejects.toThrow('bug');
  });
});

describe('upload outcome [R2-01 … R2-04, R2-09, R2-10]', () => {
  it('records an unreadable or empty file as rejected', async () => {
    const { service, repository, store } = setup();
    const unreadable = await service.upload(alphaHr, fields, {
      buffer: Buffer.from([0x41, 0x2c, 0xff, 0x0a]),
      originalname: 'bad.csv',
    });
    expect(UploadDetailSchema.parse(unreadable)).toMatchObject({
      status: 'rejected',
      issues: [{ row: null, field: null, code: 'unreadable', severity: 'error' }],
      issuesTotal: 1,
    });
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Data');
    const empty = await service.upload(alphaHr, fields, {
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
      originalname: 'empty.xlsx',
    });
    expect(empty.issues[0]?.code).toBe('empty_file');
    expect(repository.accept).not.toHaveBeenCalled();
    // The rejected file is kept: its problems can be checked against it.
    expect(store.objects.size).toBe(2);
  });

  it('records a file with errors as rejected, with every problem', async () => {
    const { service, repository } = setup();
    const result = await service.upload(
      alphaHr,
      fields,
      csvFile([TEMPLATE_HEADERS, VALID_ROW, VALID_ROW]),
    );
    expect(result).toMatchObject({ status: 'rejected', rows: 2 });
    expect(result.issues.map((issue) => issue.code)).toEqual(['duplicate_employee']);
    expect(repository.recordRejected.mock.calls[0]?.[1]).toMatchObject({
      entityId: SUB_A,
      period: '2026-09',
      templateId: TEMPLATE.id,
      uploaderName: 'Alpha HR',
      file: { fileName: 'employees.csv', mediaType: CSV_TYPE, scanEngine: 'stub' },
    });
  });

  it('accepts a valid file: compared, checked, summarised, reviewers told', async () => {
    const { service, repository, store } = setup();
    const result = await service.upload(alphaHr, fields, VALID);
    expect(result).toMatchObject({ status: 'accepted', rows: 1, flags: 0 });
    const input = repository.accept.mock.calls[0]?.[1] as AcceptInput;
    expect(input.records).toHaveLength(1);
    expect(input.summary).toEqual([
      { department: 'Finance', metrics: expect.objectContaining({ headcount: 1 }) as unknown },
    ]);
    expect(input.comparison).toMatchObject({ previousPeriod: null, headcount: 1 });
    expect(repository.salaryHistory).toHaveBeenCalledWith(
      expect.anything(),
      SUB_A,
      '2023-09',
      '2026-08',
    );
    expect(repository.recordsInUse).not.toHaveBeenCalled();
    const notices = input.notifications({
      reference: 'UP-0009',
      entityId: SUB_A,
      entityCode: 'SUB-A',
      period: '2026-09',
      version: 1,
      uploadId: UPLOAD_ID,
      flags: 0,
    });
    expect(notices).toEqual([
      expect.objectContaining({
        recipient: { role: ROLES.reviewer },
        kind: 'group_upload_accepted',
      }),
    ]);
    expect([...store.objects.keys()]).toEqual([`group-uploads/${SUB_A}/${result.id}`]);
  });

  it('raises flags from the previous month and approved increments, and tells the uploader', async () => {
    const { service, repository, quality } = setup();
    repository.previousPeriod.mockResolvedValueOnce('2026-08');
    repository.recordsInUse.mockResolvedValueOnce([
      snapshotRecord({ period: '2026-08', grossSalary: '10000.00', grade: 'G4' }),
    ]);
    const approved: ApprovedIncrementRecord[] = [
      {
        entityId: SUB_A,
        entityCode: 'SUB-A',
        cycleId: 'c',
        employeeNumber: 'EMP-1101',
        currency: 'AED',
        currentSalary: '10000.00',
        proposedKind: 'percent',
        proposedValue: '5.00',
        approved: { kind: 'amount', value: '1000.00' },
        decidedAt: NOW,
      },
      {
        entityId: SUB_A,
        entityCode: 'SUB-A',
        cycleId: 'c',
        employeeNumber: 'EMP-9',
        currency: 'AED',
        currentSalary: '10000.00',
        proposedKind: 'percent',
        proposedValue: '5.00',
        approved: null,
        decidedAt: NOW,
      },
    ];
    quality.approvedIncrements.mockResolvedValueOnce(approved);
    await service.upload(alphaHr, fields, VALID);
    const input = repository.accept.mock.calls[0]?.[1] as AcceptInput;
    // 10,000 → 14,200: grade changed, +42% (> 20%), and not the approved 11,000.
    expect(input.flags.map((flag) => flag.ruleCode)).toEqual(['ANM-03', 'ANM-05']);
    expect(input.flags[1]?.detail).toMatchObject({
      expected: '11000.00',
      approvedPercent: '10.00',
    });
    expect(quality.approvedIncrements).toHaveBeenCalledWith(expect.anything(), {
      entityId: SUB_A,
      before: NOW,
    });
    const notices = input.notifications({
      reference: 'UP-0009',
      entityId: SUB_A,
      entityCode: 'SUB-A',
      period: '2026-09',
      version: 2,
      uploadId: UPLOAD_ID,
      flags: 2,
    });
    expect(notices.map((notice) => [notice.kind, notice.recipient])).toEqual([
      ['group_upload_accepted', { role: ROLES.reviewer }],
      ['group_flags_raised', { userId: 'alpha' }],
    ]);
  });

  it('refuses the file in use again (409) and removes the stored object', async () => {
    const { service, repository, store } = setup();
    repository.accept.mockRejectedValueOnce(new GroupDataError('duplicate_file'));
    const error = await failure(service.upload(alphaHr, fields, VALID));
    expect(error).toMatchObject({
      status: 409,
      details: [{ path: 'file', code: 'duplicate_file' }],
    });
    expect(store.objects.size).toBe(0);
  });

  it('logs an object it could not remove after a failure', async () => {
    const { service, repository, store, error } = setup();
    repository.accept.mockRejectedValueOnce(new Error('database down'));
    store.remove.mockRejectedValueOnce(new Error('store down'));
    await expect(service.upload(alphaHr, fields, VALID)).rejects.toThrow('database down');
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'group_upload_orphaned' }),
      'Orphaned object',
    );
  });

  it('reads Excel files too, and lets a group caller upload for any subsidiary', async () => {
    const { service } = setup();
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Data');
    sheet.addRow(TEMPLATE_HEADERS);
    sheet.addRow(VALID_ROW.map((value) => (value === '' ? null : value)));
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    const result = await service.upload(
      reviewer,
      { ...fields, entityId: SUB_B },
      {
        buffer,
        originalname: 'employees.xlsx',
      },
    );
    expect(result.status).toBe('accepted');
  });
});

describe('uploads, files and records [R2-03, R2-04, R2-08, R2-13]', () => {
  it('pages uploads and returns one with at most 200 problems', async () => {
    const { service, repository } = setup();
    const page = UploadPageSchema.parse(
      await service.uploads(alphaHr, { page: 2, pageSize: 10, period: '2026-09' }),
    );
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 1 });
    expect(repository.uploads).toHaveBeenCalledWith(expect.anything(), {
      entityId: undefined,
      period: '2026-09',
      limit: 10,
      offset: 10,
    });
    repository.upload.mockResolvedValueOnce(
      uploadRecord({
        status: 'rejected',
        version: null,
        errors: 250,
        issues: Array.from({ length: 250 }, (_, index) => ({
          row: index + 2,
          field: 'grade',
          code: 'required',
          severity: 'error' as const,
        })),
      }),
    );
    const detail = await service.uploadDetail(alphaHr, UPLOAD_ID);
    expect([detail.issues.length, detail.issuesTotal]).toEqual([200, 250]);
    repository.upload.mockResolvedValueOnce(null);
    expect((await failure(service.uploadDetail(alphaHr, UPLOAD_ID))).status).toBe(404);
  });

  it('builds the problem report and serves the original file', async () => {
    const { service, repository, store } = setup();
    repository.upload.mockResolvedValueOnce(
      uploadRecord({ issues: [{ row: 3, field: 'grade', code: 'required', severity: 'error' }] }),
    );
    const report = await service.issuesFile(alphaHr, UPLOAD_ID, 'en');
    expect(report).toMatchObject({ fileName: 'UP-0001-problems.xlsx' });
    store.objects.set(`group-uploads/${SUB_A}/${UPLOAD_ID}`, Buffer.from('a,b'));
    const original = await service.originalFile(alphaHr, UPLOAD_ID);
    expect(original).toMatchObject({
      fileName: 'employees.csv',
      contentType: 'text/csv; charset=utf-8',
    });
    repository.uploadFile.mockResolvedValueOnce({
      objectKey: `group-uploads/${SUB_A}/${UPLOAD_ID}`,
      fileName: 'e.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect((await service.originalFile(alphaHr, UPLOAD_ID)).contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    repository.uploadFile.mockResolvedValueOnce(null);
    expect((await failure(service.originalFile(alphaHr, UPLOAD_ID))).status).toBe(404);
  });

  it('pages employees, with pay only for callers with compensation access', async () => {
    const { service, repository } = setup();
    const page = EmployeePageSchema.parse(
      await service.employees(alphaHr, { period: '2026-09', page: 1, pageSize: 25 }),
    );
    expect(page.items[0]?.grossSalary).toBe('14200.00');
    expect(page.summary).toEqual({
      entities: 2,
      entitiesWithData: 1,
      versions: 1,
      lastChange: null,
    });
    repository.employees.mockResolvedValueOnce({
      items: [snapshotRecord()],
      total: 1,
      departments: [],
      entities: 1,
      entitiesWithData: 1,
      versions: 1,
      lastChange: { at: NOW, entityCode: 'SUB-A', version: 2 },
    });
    const hidden = await service.employees(executive, { period: '2026-09', page: 1, pageSize: 25 });
    expect(hidden.items[0]?.grossSalary).toBeNull();
    expect(hidden.summary.lastChange).toEqual({
      at: NOW.toISOString(),
      entityCode: 'SUB-A',
      version: 2,
    });
  });

  it('shows an employee history with what changed between versions', async () => {
    const { service, repository } = setup();
    const history = EmployeeHistorySchema.parse(await service.history(alphaHr, RECORD_ID));
    expect(history.versions.map((version) => version.changes)).toEqual([
      [{ field: 'gross_salary', before: '14200.00', after: '15000.00' }],
      [],
    ]);
    const hidden = await service.history(executive, RECORD_ID);
    expect(hidden.versions[0]?.changes).toEqual([
      { field: 'gross_salary', before: null, after: null },
    ]);
    repository.history.mockResolvedValueOnce(null);
    expect((await failure(service.history(alphaHr, RECORD_ID))).status).toBe(404);
    repository.history.mockResolvedValueOnce({ records: [] });
    expect((await failure(service.history(alphaHr, RECORD_ID))).status).toBe(404);
  });

  it('compares added fields too', () => {
    const newer = snapshotRecord({ extra: { project: 'P2', site: 'Dubai' } });
    const older = snapshotRecord({ extra: { project: 'P1' } });
    expect(changesBetween(newer, older, true)).toEqual([
      { field: 'project', before: 'P1', after: 'P2' },
      { field: 'site', before: null, after: 'Dubai' },
    ]);
  });

  it('extracts as Excel, CSV and Palm HR CSV', async () => {
    const { service, repository } = setup();
    const query = { period: '2026-09', allVersions: true, locale: 'en' as const };
    expect((await service.extract(reviewer, { ...query, format: 'xlsx' })).fileName).toBe(
      'PeopleForge-RP-08-2026-09.xlsx',
    );
    const csv = await service.extract(reviewer, { ...query, format: 'csv' });
    expect(csv).toMatchObject({ fileName: 'PeopleForge-RP-08-2026-09.csv' });
    const palm = await service.extract(reviewer, { ...query, format: 'palmhr', entityId: SUB_A });
    expect(palm.fileName).toBe('PeopleForge-RP-08-2026-09-palm-hr.csv');
    expect(repository.extract).toHaveBeenLastCalledWith(
      expect.anything(),
      { period: '2026-09', entityId: SUB_A, allVersions: true },
      'palmhr',
    );
  });
});
