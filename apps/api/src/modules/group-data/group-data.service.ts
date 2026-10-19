import { createHash, randomUUID } from 'node:crypto';
import {
  ALWAYS_REQUIRED,
  businessDay,
  CORE_FIELD_KEYS,
  MAX_LISTED_ISSUES,
  MAX_UPLOAD_MB,
  ROLES,
  UploadComparisonSchema,
  type EmployeeHistory,
  type EmployeePage,
  type EmployeeQuery,
  type EmployeeRecord,
  type ExtractQuery,
  type FieldTemplate,
  type PublishTemplate,
  type Upload,
  type UploadDetail,
  type UploadFields,
  type UploadIssue,
  type UploadPage,
  type UploadQuery,
} from '@peopleforge/contracts';
import {
  GroupDataError,
  type DataQualityRepository,
  type GroupDataRepository,
  type NewNotification,
  type SnapshotRecord,
  type TemplateFieldRecord,
  type TemplateRecord,
  type UploadInput,
  type UploadRecord,
} from '@peopleforge/db';
import {
  detectMediaType,
  IntegrationError,
  safeFileName,
  type MalwareScanner,
  type ObjectStore,
} from '@peopleforge/integrations';
import type { Locale } from '@sirius/shared-types';
import type { Logger } from 'pino';
import {
  displayNameOf,
  permissionsOfPrincipal,
  scopeOf,
  type Principal,
} from '../../auth/principal.js';
import {
  ConflictError,
  DependencyUnavailableError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  ValidationError,
  type DomainError,
} from '../../errors/domain-errors.js';
import { apiTranslator } from '../../i18n.js';
import { figuresOf } from '../increment-requests/money.js';
import { compareUpload, monthsBefore, type Rule, type RuleKind } from './compare.js';
import {
  extractCsv,
  extractWorkbook,
  fieldValue,
  issuesWorkbook,
  palmHrCsv,
  PAY_FIELDS,
  templateWorkbook,
} from './group-files.js';
import { CSV_TYPE, readSheet, XLSX_TYPE, type Sheet } from './spreadsheet.js';
import { summarise } from './summary.js';
import { validateSheet } from './validate.js';

/** The part of a multipart file the service needs (multer memory storage). */
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}

export interface GroupFile {
  body: Buffer;
  fileName: string;
  contentType: string;
}

export interface GroupDataDependencies {
  repository: GroupDataRepository;
  quality: DataQualityRepository;
  store: ObjectStore;
  scanner: MalwareScanner;
  logger: Logger;
  now?: () => Date;
}

const MB = 1024 * 1024;
const XLSX_CONTENT = XLSX_TYPE;
const CSV_CONTENT = 'text/csv; charset=utf-8';

/** Months of salary history read for ANM-04 (its threshold may be up to this). */
const HISTORY_MONTHS = 36;

function toDomainError(error: GroupDataError): DomainError {
  switch (error.reason) {
    case 'version_conflict':
      return new ConflictError('The template changed since it was read', [
        { path: 'version', code: 'stale' },
      ]);
    case 'duplicate_file':
      return new ConflictError('This file is already the version in use', [
        { path: 'file', code: 'duplicate_file' },
      ]);
    case 'not_found':
      return new NotFoundError('Not found');
  }
}

async function guard<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error: unknown) {
    throw error instanceof GroupDataError ? toDomainError(error) : error;
  }
}

const iso = (value: Date) => value.toISOString();

export function toUpload(record: UploadRecord): Upload {
  return {
    id: record.id,
    reference: record.reference,
    entity: record.entity,
    period: record.period,
    version: record.version,
    status: record.status,
    fileName: record.fileName,
    rows: record.rows,
    errors: record.errors,
    warnings: record.warnings,
    templateVersion: record.templateVersion,
    uploadedByName: record.uploadedByName,
    uploadedAt: iso(record.uploadedAt),
    comparison: UploadComparisonSchema.nullable().parse(record.comparison),
    flags: record.flags,
  };
}

function toDetail(record: UploadRecord): UploadDetail {
  return {
    ...toUpload(record),
    issues: record.issues.slice(0, MAX_LISTED_ISSUES) as UploadIssue[],
    issuesTotal: record.issues.length,
  };
}

function toTemplate(record: TemplateRecord): FieldTemplate {
  return {
    id: record.id,
    version: record.version,
    activatedAt: record.activatedAt === null ? null : iso(record.activatedAt),
    fields: record.fields,
  };
}

const canSeePay = (caller: Principal) =>
  permissionsOfPrincipal(caller).has('employee_data:read_compensation');

function toEmployee(record: SnapshotRecord, pay: boolean): EmployeeRecord {
  return {
    id: record.id,
    entity: { id: record.entityId, code: record.entityCode },
    period: record.period,
    employeeNumber: record.employeeNumber,
    fullName: record.fullName,
    department: record.department,
    designation: record.designation,
    grade: record.grade,
    grossSalary: pay ? record.grossSalary : null,
    currency: record.currency,
    dateJoined: record.dateJoined,
    dateOfBirth: record.dateOfBirth,
    gender: record.gender,
    nationality: record.nationality,
    status: record.status,
    dateLeft: record.dateLeft,
    costCentre: record.costCentre,
    extra: record.extra,
    upload: {
      id: record.upload.id,
      reference: record.upload.reference,
      version: record.upload.version,
    },
  };
}

/** The fields that changed from `older` to `newer` (R2-13); pay hidden without access. */
export function changesBetween(
  newer: SnapshotRecord,
  older: SnapshotRecord | undefined,
  pay: boolean,
): EmployeeHistory['versions'][number]['changes'] {
  if (older === undefined) return [];
  const keys = [
    ...CORE_FIELD_KEYS,
    ...new Set([...Object.keys(older.extra), ...Object.keys(newer.extra)]),
  ];
  return keys
    .map((field) => ({ field, before: fieldValue(older, field), after: fieldValue(newer, field) }))
    .filter((change) => change.before !== change.after)
    .map((change) =>
      !pay && PAY_FIELDS.has(change.field) ? { ...change, before: null, after: null } : change,
    );
}

/** Problems that stop a file before its rows are read. */
function sheetIssue(reason: Extract<Sheet, { ok: false }>['reason']): UploadIssue {
  return {
    row: null,
    field: null,
    code: reason === 'empty' ? 'empty_file' : reason,
    severity: 'error',
  };
}

/** A template the dashboards can rely on (R2-02): core fields kept, keys unique, enums listed. */
function templateProblems(
  current: TemplateRecord,
  input: PublishTemplate,
): { path: string; code: string }[] {
  const problems: { path: string; code: string }[] = [];
  const seen = new Set<string>();
  const types = new Map(current.fields.filter((f) => f.core).map((f) => [f.key, f.type]));
  input.fields.forEach((field, index) => {
    if (seen.has(field.key))
      problems.push({ path: `fields.${String(index)}.key`, code: 'duplicate' });
    seen.add(field.key);
    const coreType = types.get(field.key);
    if (coreType !== undefined && coreType !== field.type) {
      problems.push({ path: `fields.${String(index)}.type`, code: 'core_type' });
    }
    if ((ALWAYS_REQUIRED as readonly string[]).includes(field.key) && !field.required) {
      problems.push({ path: `fields.${String(index)}.required`, code: 'core_required' });
    }
    if (field.type === 'enum' && field.allowedValues.length === 0) {
      problems.push({ path: `fields.${String(index)}.allowedValues`, code: 'required' });
    }
  });
  for (const key of types.keys()) {
    if (!seen.has(key)) problems.push({ path: 'fields', code: `core_missing:${key}` });
  }
  return problems;
}

/**
 * Group-level employee data (R2-01 … R2-04, R2-08, R2-09, R2-10, R2-12 … R2-14).
 *
 * An upload is checked in this order, and nothing is kept until every check passes: subsidiary
 * is the caller's → month not in the future → file present and ≤ 5 MB → type from the content
 * (Excel by magic bytes; otherwise strict UTF-8 text named .csv) → malware scan → store → read
 * defensively → check against the template. A file with errors is recorded as rejected with
 * its problems and changes nothing; a valid file is compared with the previous month, checked
 * by the anomaly rules, summarised, and accepted as the next version in one transaction.
 */
export class GroupDataService {
  private readonly now: () => Date;

  constructor(private readonly deps: GroupDataDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  async template(caller: Principal): Promise<FieldTemplate> {
    return toTemplate(await this.deps.repository.activeTemplate(scopeOf(caller)));
  }

  async templateFile(caller: Principal, locale: Locale): Promise<GroupFile> {
    const template = await this.deps.repository.activeTemplate(scopeOf(caller));
    return {
      body: await templateWorkbook(template, apiTranslator(locale), locale),
      fileName: `PeopleForge-employee-data-template-v${String(template.version)}.xlsx`,
      contentType: XLSX_CONTENT,
    };
  }

  async publishTemplate(caller: Principal, input: PublishTemplate): Promise<FieldTemplate> {
    const current = await this.deps.repository.activeTemplate(scopeOf(caller));
    const problems = templateProblems(current, input);
    if (problems.length > 0) throw new ValidationError('Invalid template', problems);
    const published = await guard(
      this.deps.repository.publishTemplate(scopeOf(caller), {
        version: input.version,
        fields: input.fields.map((field) => ({
          ...field,
          label:
            field.label.ar === undefined
              ? { en: field.label.en }
              : { en: field.label.en, ar: field.label.ar },
        })),
      }),
    );
    return toTemplate(published);
  }

  async upload(
    caller: Principal,
    fields: UploadFields,
    file: UploadedFile | undefined,
  ): Promise<UploadDetail> {
    if (caller.scope === 'entity' && !caller.entityIds.includes(fields.entityId)) {
      throw new ForbiddenError('Not your subsidiary');
    }
    if (fields.period > businessDay(this.now()).slice(0, 7)) {
      throw new ValidationError('The month has not started', [{ path: 'period', code: 'future' }]);
    }
    if (file === undefined || file.buffer.length === 0) {
      throw new ValidationError('Choose a file', [{ path: 'file', code: 'required' }]);
    }
    if (file.buffer.length > MAX_UPLOAD_MB * MB) {
      throw new PayloadTooLargeError('File too large', [{ path: 'file', code: 'too_large' }]);
    }
    const fileName = safeFileName(file.originalname, 'employee-data');
    const detected = await detectMediaType(file.buffer);
    const mediaType =
      detected === XLSX_TYPE
        ? XLSX_TYPE
        : detected === null && fileName.toLowerCase().endsWith('.csv')
          ? CSV_TYPE
          : null;
    if (mediaType === null) {
      throw new ValidationError('File type not accepted', [{ path: 'file', code: 'media_type' }]);
    }
    const verdict = await this.dependency(this.deps.scanner.scan(file.buffer));
    if (!verdict.clean) {
      // Security event: who and where, never the file name or content.
      this.deps.logger.warn(
        {
          event: 'group_upload_infected',
          userId: caller.userId,
          entityId: fields.entityId,
          signature: verdict.signature,
        },
        'Infected upload refused',
      );
      throw new ValidationError('File refused by the malware scan', [
        { path: 'file', code: 'infected' },
      ]);
    }

    const id = randomUUID();
    const objectKey = `group-uploads/${fields.entityId}/${id}`;
    await this.dependency(this.deps.store.put(objectKey, file.buffer, mediaType));
    try {
      const scope = scopeOf(caller);
      const template = await this.deps.repository.activeTemplate(scope);
      const base: UploadInput = {
        id,
        entityId: fields.entityId,
        period: fields.period,
        templateId: template.id,
        file: {
          objectKey,
          fileName,
          mediaType,
          sizeBytes: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          scanEngine: this.deps.scanner.engine,
        },
        rows: 0,
        uploaderName: displayNameOf(caller),
        issues: [],
      };
      const sheet = await readSheet(file.buffer, mediaType);
      if (!sheet.ok) {
        return toDetail(
          await this.deps.repository.recordRejected(scope, {
            ...base,
            issues: [sheetIssue(sheet.reason)],
          }),
        );
      }
      const checked = validateSheet(template.fields, sheet, fields.period);
      const withRows = { ...base, rows: sheet.rows.length, issues: checked.issues };
      if (checked.records.length === 0) {
        return toDetail(await this.deps.repository.recordRejected(scope, withRows));
      }
      const { comparison, flags } = await this.compare(caller, fields, checked.records);
      const accepted = await guard(
        this.deps.repository.accept(scope, {
          ...withRows,
          records: checked.records,
          summary: summarise(checked.records, fields.period),
          comparison,
          flags,
          notifications: (context) => {
            const notices: NewNotification[] = [
              {
                recipient: { role: ROLES.reviewer },
                kind: 'group_upload_accepted',
                entityId: context.entityId,
                requestId: null,
                params: {
                  reference: context.reference,
                  entity: context.entityCode,
                  period: context.period,
                  version: context.version,
                  flags: context.flags,
                  actor: displayNameOf(caller),
                  uploadId: context.uploadId,
                },
              },
            ];
            if (context.flags > 0) {
              notices.push({
                recipient: { userId: caller.userId },
                kind: 'group_flags_raised',
                entityId: context.entityId,
                requestId: null,
                params: {
                  reference: context.reference,
                  entity: context.entityCode,
                  period: context.period,
                  count: context.flags,
                  uploadId: context.uploadId,
                },
                actionNeeded: true,
              });
            }
            return notices;
          },
        }),
      );
      return toDetail(accepted);
    } catch (error: unknown) {
      // Nothing recorded refers to the object: it must not linger.
      await this.deps.store.remove(objectKey).catch(() => {
        this.deps.logger.error({ event: 'group_upload_orphaned', objectKey }, 'Orphaned object');
      });
      throw error;
    }
  }

  /** Prior-period comparison and the anomaly rules (R2-09, R2-10). */
  private async compare(
    caller: Principal,
    fields: UploadFields,
    records: Parameters<typeof compareUpload>[0]['records'],
  ) {
    const scope = scopeOf(caller);
    const { repository, quality } = this.deps;
    const previousPeriod = await repository.previousPeriod(scope, fields.entityId, fields.period);
    const previous =
      previousPeriod === null
        ? null
        : {
            period: previousPeriod,
            records: await repository.recordsInUse(scope, fields.entityId, previousPeriod),
          };
    const rules: Rule[] = (await quality.rules(scope)).map((rule) => ({
      code: rule.code,
      kind: rule.kind as RuleKind,
      threshold: rule.threshold,
      enabled: rule.enabled,
    }));
    const approved = (
      await quality.approvedIncrements(scope, { entityId: fields.entityId, before: this.now() })
    ).map((increment) => {
      const figures = figuresOf(
        increment.currentSalary,
        increment.approved?.kind ?? increment.proposedKind,
        increment.approved?.value ?? increment.proposedValue,
      );
      return {
        employeeNumber: increment.employeeNumber,
        currentSalary: increment.currentSalary,
        newSalary: figures.newSalary,
        percent: figures.percent,
      };
    });
    return compareUpload({
      period: fields.period,
      records,
      previous,
      rules,
      gradeBands: await repository.gradeBands(scope),
      salaryHistory: await repository.salaryHistory(
        scope,
        fields.entityId,
        monthsBefore(fields.period, HISTORY_MONTHS),
        monthsBefore(fields.period, 1),
      ),
      approved,
      elsewhere: await repository.numbersElsewhere(
        scope,
        fields.entityId,
        fields.period,
        records.map((record) => record.employeeNumber),
      ),
    });
  }

  async uploads(caller: Principal, query: UploadQuery): Promise<UploadPage> {
    const page = await this.deps.repository.uploads(scopeOf(caller), {
      entityId: query.entityId,
      period: query.period,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      items: page.items.map(toUpload),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
    };
  }

  async uploadDetail(caller: Principal, id: string): Promise<UploadDetail> {
    return toDetail(await this.found(caller, id));
  }

  async issuesFile(caller: Principal, id: string, locale: Locale): Promise<GroupFile> {
    const upload = await this.found(caller, id);
    const template = await this.deps.repository.activeTemplate(scopeOf(caller));
    return {
      body: await issuesWorkbook(upload, template.fields, apiTranslator(locale), locale),
      fileName: `${upload.reference}-problems.xlsx`,
      contentType: XLSX_CONTENT,
    };
  }

  /** The original file, as uploaded (R2-08); each download is audited by the repository. */
  async originalFile(caller: Principal, id: string): Promise<GroupFile> {
    const location = await this.deps.repository.uploadFile(scopeOf(caller), id);
    if (location === null) throw new NotFoundError('Upload not found');
    return {
      body: await this.dependency(this.deps.store.get(location.objectKey)),
      fileName: location.fileName,
      contentType: location.mediaType === CSV_TYPE ? CSV_CONTENT : location.mediaType,
    };
  }

  async employees(caller: Principal, query: EmployeeQuery): Promise<EmployeePage> {
    const page = await this.deps.repository.employees(scopeOf(caller), {
      period: query.period,
      entityId: query.entityId,
      department: query.department,
      search: query.search,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    const pay = canSeePay(caller);
    return {
      items: page.items.map((record) => toEmployee(record, pay)),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
      summary: {
        entities: page.entities,
        entitiesWithData: page.entitiesWithData,
        versions: page.versions,
        lastChange:
          page.lastChange === null ? null : { ...page.lastChange, at: iso(page.lastChange.at) },
      },
      departments: page.departments,
    };
  }

  async history(caller: Principal, recordId: string): Promise<EmployeeHistory> {
    const found = await this.deps.repository.history(scopeOf(caller), recordId);
    const [latest] = found?.records ?? [];
    if (found === null || latest === undefined) throw new NotFoundError('Employee not found');
    const pay = canSeePay(caller);
    return {
      employeeNumber: latest.employeeNumber,
      entity: { id: latest.entityId, code: latest.entityCode },
      versions: found.records.map((record, index) => ({
        period: record.period,
        upload: {
          id: record.upload.id,
          reference: record.upload.reference,
          version: record.upload.version,
          status: record.upload.status as Upload['status'],
          uploadedByName: record.uploadedByName,
          uploadedAt: iso(record.uploadedAt),
        },
        record: toEmployee(record, pay),
        changes: changesBetween(record, found.records[index + 1], pay),
      })),
    };
  }

  /** RP-08 raw extract (R2-08, R2-14); the repository audits every extraction. */
  async extract(caller: Principal, query: ExtractQuery): Promise<GroupFile> {
    const scope = scopeOf(caller);
    const template = await this.deps.repository.activeTemplate(scope);
    const rows = await this.deps.repository.extract(
      scope,
      { period: query.period, entityId: query.entityId, allVersions: query.allVersions },
      query.format,
    );
    const options = {
      fields: template.fields as readonly TemplateFieldRecord[],
      compensation: canSeePay(caller),
      t: apiTranslator(query.locale),
      locale: query.locale,
    };
    const name = `PeopleForge-RP-08-${query.period}`;
    switch (query.format) {
      case 'xlsx':
        return {
          body: await extractWorkbook(rows, options),
          fileName: `${name}.xlsx`,
          contentType: XLSX_CONTENT,
        };
      case 'csv':
        return {
          body: extractCsv(rows, options),
          fileName: `${name}.csv`,
          contentType: CSV_CONTENT,
        };
      case 'palmhr':
        return {
          body: palmHrCsv(rows, options),
          fileName: `${name}-palm-hr.csv`,
          contentType: CSV_CONTENT,
        };
    }
  }

  private async found(caller: Principal, id: string): Promise<UploadRecord> {
    const upload = await this.deps.repository.upload(scopeOf(caller), id);
    if (upload === null) throw new NotFoundError('Upload not found');
    return upload;
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
