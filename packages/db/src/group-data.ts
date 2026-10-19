import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import { recordAudit } from './audit.js';
import {
  EMPLOYEE_SALARY,
  FLAG_DETAIL,
  SNAPSHOT_BASIC,
  SNAPSHOT_GROSS,
} from './encrypted-fields.js';
import type { FieldCipher } from './field-crypto.js';
import { insertNotifications, type NewNotification } from './notifications.js';
import type { Database, LocalisedText } from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Group-level employee data (R2-01 … R2-04, R2-08, R2-12 … R2-14): the field template, uploads
 * and their versions, the records in use per subsidiary and month, and the raw extract. The
 * API parses and checks files and computes comparisons, flags and summaries; this module stores
 * them atomically under Row-Level Security. Salaries are encrypted (ADR-008).
 */

type Trx = Transaction<Database>;

/** "2026-09" ↔ the first day of that month, as stored. */
const toDate = (period: string) => `${period}-01`;

export interface TemplateFieldRecord {
  key: string;
  label: LocalisedText;
  type: 'text' | 'date' | 'decimal' | 'enum';
  required: boolean;
  core: boolean;
  allowedValues: string[];
  palmHrField: string | null;
}

export interface TemplateRecord {
  id: string;
  version: number;
  activatedAt: Date | null;
  fields: TemplateFieldRecord[];
}

export interface GradeBandRecord {
  grade: string;
  minSalary: string;
  maxSalary: string;
  currency: string;
}

/** One employee's values from an upload, checked and typed by the API. */
export interface SnapshotInput {
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  department: string;
  designation: string | null;
  grade: string;
  grossSalary: string;
  basicSalary: string | null;
  currency: string;
  /** ISO dates. */
  dateJoined: string;
  dateOfBirth: string | null;
  gender: string;
  nationality: string | null;
  status: string;
  dateLeft: string | null;
  costCentre: string | null;
  extra: Record<string, string>;
}

export interface SnapshotRecord extends SnapshotInput {
  id: string;
  entityId: string;
  entityCode: string;
  period: string;
  upload: { id: string; reference: string; version: number; status: string };
}

export interface UploadIssueRecord {
  row: number | null;
  field: string | null;
  code: string;
  severity: 'error' | 'warning';
}

export interface FileInput {
  objectKey: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  scanEngine: string;
}

/** A flag the API's anomaly rules raised for this upload (S9). */
export interface FlagInput {
  ruleCode: string;
  employeeNumber: string | null;
  employeeName: string | null;
  field: string | null;
  /** Display values (previous, current, expected…): stored encrypted. */
  detail: Record<string, string>;
}

export interface UploadRecord {
  id: string;
  reference: string;
  entity: { id: string; code: string };
  period: string;
  version: number | null;
  status: 'rejected' | 'accepted' | 'superseded';
  fileName: string;
  rows: number;
  errors: number;
  warnings: number;
  templateVersion: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: Date;
  comparison: Record<string, unknown> | null;
  flags: number;
  issues: UploadIssueRecord[];
}

/** What the API tells the repository about a checked file. */
export interface UploadInput {
  id: string;
  entityId: string;
  period: string;
  templateId: string;
  file: FileInput;
  rows: number;
  uploaderName: string;
  issues: readonly UploadIssueRecord[];
}

export interface AcceptContext {
  reference: string;
  entityId: string;
  entityCode: string;
  period: string;
  version: number;
  uploadId: string;
  flags: number;
}

export interface AcceptInput extends UploadInput {
  records: readonly SnapshotInput[];
  /** Per department (R2-05 cache). */
  summary: readonly { department: string; metrics: object }[];
  comparison: Record<string, unknown> | null;
  flags: readonly FlagInput[];
  notifications: (context: AcceptContext) => readonly NewNotification[];
}

export interface EmployeeQueryInput {
  period: string;
  entityId?: string | undefined;
  department?: string | undefined;
  search?: string | undefined;
  limit: number;
  offset: number;
}

/** One subsidiary's per-department figures for a month (dashboards, R2-05). */
export interface SummaryRow {
  entityId: string;
  entityCode: string;
  period: string;
  department: string;
  metrics: Record<string, unknown>;
}

export interface ExtractRow {
  record: SnapshotRecord;
  uploadedByName: string;
  uploadedAt: Date;
  fileName: string;
}

export interface GroupDataRepository {
  activeTemplate: (scope: Scope) => Promise<TemplateRecord>;
  publishTemplate: (
    scope: Scope,
    input: { version: number; fields: readonly Omit<TemplateFieldRecord, 'core'>[] },
  ) => Promise<TemplateRecord>;
  gradeBands: (scope: Scope) => Promise<GradeBandRecord[]>;
  /** The latest month before `period` with data in use for the subsidiary, or null. */
  previousPeriod: (scope: Scope, entityId: string, period: string) => Promise<string | null>;
  /** The records in use for a subsidiary and month (decrypted). */
  recordsInUse: (scope: Scope, entityId: string, period: string) => Promise<SnapshotRecord[]>;
  /** Gross salaries in use per employee per month, `from`…`to` inclusive (ANM-04). */
  salaryHistory: (
    scope: Scope,
    entityId: string,
    from: string,
    to: string,
  ) => Promise<{ employeeNumber: string; period: string; grossSalary: string }[]>;
  /** Of these employee IDs, those in use in another subsidiary for the month (ANM-07). */
  numbersElsewhere: (
    scope: Scope,
    entityId: string,
    period: string,
    numbers: readonly string[],
  ) => Promise<string[]>;
  recordRejected: (scope: Scope, input: UploadInput) => Promise<UploadRecord>;
  accept: (scope: Scope, input: AcceptInput) => Promise<UploadRecord>;
  uploads: (
    scope: Scope,
    query: {
      entityId?: string | undefined;
      period?: string | undefined;
      limit: number;
      offset: number;
    },
  ) => Promise<{ items: UploadRecord[]; total: number }>;
  upload: (scope: Scope, id: string) => Promise<UploadRecord | null>;
  /** Where an uploaded file is; reading it is recorded in the audit trail (R2-13). */
  uploadFile: (
    scope: Scope,
    id: string,
  ) => Promise<{ objectKey: string; fileName: string; mediaType: string } | null>;
  employees: (
    scope: Scope,
    query: EmployeeQueryInput,
  ) => Promise<{
    items: SnapshotRecord[];
    total: number;
    departments: string[];
    entities: number;
    entitiesWithData: number;
    versions: number;
    lastChange: { at: Date; entityCode: string; version: number } | null;
  }>;
  /** One employee's records across months and versions, newest first; null if unseen. */
  history: (
    scope: Scope,
    recordId: string,
  ) => Promise<{
    records: (SnapshotRecord & { uploadedByName: string; uploadedAt: Date })[];
  } | null>;
  /** The stored per-department figures of the versions in use, `from`…`to` (R2-05). */
  summaries: (
    scope: Scope,
    query: { from: string; to: string; entityId?: string | undefined },
  ) => Promise<SummaryRow[]>;
  /** RP-08 rows; reading them is the extraction and is audited (R2-08, R2-13). */
  extract: (
    scope: Scope,
    query: { period: string; entityId?: string | undefined; allVersions: boolean },
    format: string,
  ) => Promise<ExtractRow[]>;
}

interface SnapshotRow {
  id: string;
  entity_id: string;
  entity_code: string;
  period: string;
  row_number: number;
  employee_number: string;
  full_name: string;
  department: string;
  designation: string | null;
  grade: string;
  gross_salary: Buffer;
  basic_salary: Buffer | null;
  currency: string;
  date_joined: string;
  date_of_birth: string | null;
  gender: string;
  nationality: string | null;
  status: string;
  date_left: string | null;
  cost_centre: string | null;
  extra: Record<string, string>;
  upload_id: string;
  reference: string;
  version: number;
  upload_status: string;
}

/** The snapshot columns, with dates and months as text (no time-zone shifts). */
const SNAPSHOT_COLUMNS = sql`s.id, s.entity_id, e.code AS entity_code, to_char(s.period, 'YYYY-MM') AS period,
  s.row_number, s.employee_number, s.full_name, s.department, s.designation, s.grade,
  s.gross_salary, s.basic_salary, s.currency, s.date_joined::text AS date_joined,
  s.date_of_birth::text AS date_of_birth, s.gender, s.nationality, s.status,
  s.date_left::text AS date_left, s.cost_centre, s.extra, u.id AS upload_id, u.reference,
  u.version, u.status AS upload_status`;

interface UploadRow {
  id: string;
  reference: string;
  entity_id: string;
  entity_code: string;
  period: string;
  version: number | null;
  status: 'rejected' | 'accepted' | 'superseded';
  file_name: string;
  rows: number;
  errors: number;
  warnings: number;
  template_version: number;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: Date;
  comparison: Record<string, unknown> | null;
  flags: number;
  issues: UploadIssueRecord[];
}

const UPLOAD_COLUMNS = sql`u.id, u.reference, u.entity_id, e.code AS entity_code,
  to_char(u.period, 'YYYY-MM') AS period, u.version, u.status, u.file_name, u.rows, u.errors,
  u.warnings, t.version AS template_version, u.uploaded_by, u.uploaded_by_name, u.uploaded_at,
  u.comparison, u.flags, u.issues`;

function toUpload(row: UploadRow): UploadRecord {
  return {
    id: row.id,
    reference: row.reference,
    entity: { id: row.entity_id, code: row.entity_code },
    period: row.period,
    version: row.version,
    status: row.status,
    fileName: row.file_name,
    rows: row.rows,
    errors: row.errors,
    warnings: row.warnings,
    templateVersion: row.template_version,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    uploadedAt: row.uploaded_at,
    comparison: row.comparison,
    flags: row.flags,
    issues: row.issues,
  };
}

/** `%text%` for LIKE, with the user's own %, _ and \ taken literally. */
function contains(search: string): string {
  return `%${search.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}

/** The single row an aggregate or a just-written row must return. */
export function only<T>(result: { rows: T[] }): T {
  const [row] = result.rows;
  if (row === undefined) throw new Error('Expected a row');
  return row;
}

/** Most issues kept on an upload: enough for any error report, bounded for the table. */
export const MAX_STORED_ISSUES = 2000;

/** Rows per INSERT when storing a version's records. */
const BATCH = 500;

export function createGroupDataRepository(
  db: Kysely<Database>,
  cipher: FieldCipher,
): GroupDataRepository {
  const toSnapshot = (row: SnapshotRow): SnapshotRecord => ({
    id: row.id,
    entityId: row.entity_id,
    entityCode: row.entity_code,
    period: row.period,
    rowNumber: row.row_number,
    employeeNumber: row.employee_number,
    fullName: row.full_name,
    department: row.department,
    designation: row.designation,
    grade: row.grade,
    grossSalary: cipher.decrypt(row.gross_salary, { ...SNAPSHOT_GROSS, rowId: row.id }),
    basicSalary:
      row.basic_salary === null
        ? null
        : cipher.decrypt(row.basic_salary, { ...SNAPSHOT_BASIC, rowId: row.id }),
    currency: row.currency,
    dateJoined: row.date_joined,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    nationality: row.nationality,
    status: row.status,
    dateLeft: row.date_left,
    costCentre: row.cost_centre,
    extra: row.extra,
    upload: {
      id: row.upload_id,
      reference: row.reference,
      version: row.version,
      status: row.upload_status,
    },
  });

  const loadTemplate = async (trx: Trx, where: ReturnType<typeof sql>): Promise<TemplateRecord> => {
    const template = await sql<{ id: string; version: number; activated_at: Date | null }>`
      SELECT id, version, activated_at FROM groupdata.field_template WHERE ${where}`.execute(trx);
    const head = only(template);
    const fields = await sql<{
      key: string;
      label: LocalisedText;
      type: TemplateFieldRecord['type'];
      required: boolean;
      core: boolean;
      allowed_values: string[];
      palm_hr_field: string | null;
    }>`SELECT key, label, type, required, core, allowed_values, palm_hr_field
         FROM groupdata.template_field WHERE template_id = ${head.id} ORDER BY position`.execute(
      trx,
    );
    return {
      id: head.id,
      version: head.version,
      activatedAt: head.activated_at,
      fields: fields.rows.map((row) => ({
        key: row.key,
        label: row.label,
        type: row.type,
        required: row.required,
        core: row.core,
        allowedValues: row.allowed_values,
        palmHrField: row.palm_hr_field,
      })),
    };
  };

  const uploadRows = (trx: Trx, id: string) =>
    sql<UploadRow>`
      SELECT ${UPLOAD_COLUMNS}
        FROM groupdata.upload u
        JOIN core.entity e ON e.id = u.entity_id
        JOIN groupdata.field_template t ON t.id = u.template_id
       WHERE u.id = ${id}`.execute(trx);

  const uploadRow = async (trx: Trx, id: string): Promise<UploadRecord | null> => {
    const [row] = (await uploadRows(trx, id)).rows;
    return row === undefined ? null : toUpload(row);
  };

  /** An upload this transaction has just written. */
  const writtenUpload = async (trx: Trx, id: string): Promise<UploadRecord> =>
    toUpload(only(await uploadRows(trx, id)));

  const insertUpload = async (
    trx: Trx,
    scope: Scope,
    input: UploadInput,
    extra: {
      status: 'rejected' | 'accepted';
      version: number | null;
      comparison: unknown;
      flags: number;
    },
  ): Promise<string> => {
    const sequence = await sql<{
      n: string;
    }>`SELECT nextval('groupdata.upload_number_seq')::text AS n`.execute(trx);
    const reference = `UP-${only(sequence).n.padStart(4, '0')}`;
    const errors = input.issues.filter((issue) => issue.severity === 'error').length;
    await sql`
      INSERT INTO groupdata.upload (id, reference, entity_id, period, version, status, template_id,
        file_name, object_key, media_type, size_bytes, sha256, scan_engine, rows, errors, warnings,
        issues, comparison, flags, uploaded_by, uploaded_by_name)
      VALUES (${input.id}, ${reference}, ${input.entityId}, ${toDate(input.period)}, ${extra.version},
        ${extra.status}, ${input.templateId}, ${input.file.fileName}, ${input.file.objectKey},
        ${input.file.mediaType}, ${input.file.sizeBytes}, ${input.file.sha256},
        ${input.file.scanEngine}, ${input.rows}, ${errors}, ${input.issues.length - errors},
        ${JSON.stringify(input.issues.slice(0, MAX_STORED_ISSUES))}::jsonb,
        ${extra.comparison === null ? null : JSON.stringify(extra.comparison)}::jsonb,
        ${extra.flags}, ${scope.userId}, ${input.uploaderName})`.execute(trx);
    return reference;
  };

  /** The newest data refreshes the employee master the Increment Portal offers (R2-04). */
  const refreshMaster = async (
    trx: Trx,
    scope: Scope,
    entityId: string,
    records: readonly SnapshotInput[],
  ): Promise<void> => {
    const existing = await sql<{ id: string; employee_number: string }>`
      SELECT id, employee_number FROM core.employee
       WHERE entity_id = ${entityId} AND deleted_at IS NULL`.execute(trx);
    const ids = new Map(existing.rows.map((row) => [row.employee_number, row.id]));
    for (let start = 0; start < records.length; start += BATCH) {
      const batch = records.slice(start, start + BATCH);
      const values = batch.map((record) => {
        const known = ids.get(record.employeeNumber);
        const id = known ?? randomUUID();
        return sql`(${id}::uuid, ${known !== undefined}::boolean, ${record.employeeNumber}::text,
          ${record.fullName}::text, ${record.grade}::text,
          ${cipher.encrypt(record.grossSalary, { ...EMPLOYEE_SALARY, rowId: id })}::bytea,
          ${record.currency}::text, ${record.status !== 'left'}::boolean)`;
      });
      await sql`
        WITH incoming (id, known, employee_number, full_name, grade, monthly_salary, currency, active) AS (
          VALUES ${sql.join(values)}
        ), updated AS (
          UPDATE core.employee e
             SET full_name = i.full_name, grade = i.grade, monthly_salary = i.monthly_salary,
                 currency = i.currency, active = i.active, updated_at = now(),
                 updated_by = ${scope.userId}, version = e.version + 1
            FROM incoming i
           WHERE i.known AND e.id = i.id
        )
        INSERT INTO core.employee (id, entity_id, employee_number, full_name, grade, monthly_salary,
          currency, active, created_by, updated_by)
        SELECT i.id, ${entityId}, i.employee_number, i.full_name, i.grade, i.monthly_salary,
               i.currency, i.active, ${scope.userId}, ${scope.userId}
          FROM incoming i WHERE NOT i.known`.execute(trx);
    }
    // No longer in the subsidiary's data: not offered for new increment requests.
    const present = records.map((record) => record.employeeNumber);
    await sql`
      UPDATE core.employee SET active = false, updated_at = now(), updated_by = ${scope.userId}
       WHERE entity_id = ${entityId} AND deleted_at IS NULL AND active
         AND NOT (employee_number = ANY (${present}::text[]))`.execute(trx);
  };

  return {
    activeTemplate: (scope) =>
      withScope(db, scope, (trx) => loadTemplate(trx, sql`status = 'active'`)),

    publishTemplate: (scope, input) =>
      withScope(db, scope, async (trx) => {
        const active = await sql<{ id: string; version: number }>`
          SELECT id, version FROM groupdata.field_template WHERE status = 'active' FOR UPDATE`.execute(
          trx,
        );
        const [current] = active.rows;
        if (current?.version !== input.version) {
          throw new GroupDataError('version_conflict');
        }
        const coreKeys = await sql<{ key: string }>`
          SELECT key FROM groupdata.template_field WHERE template_id = ${current.id} AND core`.execute(
          trx,
        );
        const cores = new Set(coreKeys.rows.map((row) => row.key));
        const latest = await sql<{ version: number }>`
          SELECT max(version)::int AS version FROM groupdata.field_template`.execute(trx);
        const version = only(latest).version + 1;
        const id = randomUUID();
        await sql`UPDATE groupdata.field_template SET status = 'retired', updated_at = now(),
                    updated_by = ${scope.userId} WHERE id = ${current.id}`.execute(trx);
        await sql`INSERT INTO groupdata.field_template (id, version, status, activated_at, created_by, updated_by)
                  VALUES (${id}, ${version}, 'active', now(), ${scope.userId}, ${scope.userId})`.execute(
          trx,
        );
        await sql`
          INSERT INTO groupdata.template_field
            (template_id, position, key, label, type, required, core, allowed_values, palm_hr_field)
          VALUES ${sql.join(
            input.fields.map(
              (field, index) => sql`(${id}, ${index + 1}, ${field.key},
                ${JSON.stringify(field.label.ar === undefined ? { en: field.label.en } : field.label)}::jsonb,
                ${field.type}, ${field.required}, ${cores.has(field.key)}, ${field.allowedValues}::text[],
                ${field.palmHrField})`,
            ),
          )}`.execute(trx);
        await recordAudit(trx, scope.userId, {
          action: 'field_template.published',
          entityId: null,
          subjectType: 'field_template',
          subjectId: id,
          details: { version, previousVersion: current.version, fields: input.fields.length },
        });
        return loadTemplate(trx, sql`id = ${id}`);
      }),

    gradeBands: (scope) =>
      withScope(db, scope, async (trx) => {
        const result = await sql<{
          grade: string;
          min_salary: string;
          max_salary: string;
          currency: string;
        }>`
          SELECT grade, min_salary::text, max_salary::text, currency
            FROM groupdata.grade_band ORDER BY position`.execute(trx);
        return result.rows.map((row) => ({
          grade: row.grade,
          minSalary: row.min_salary,
          maxSalary: row.max_salary,
          currency: row.currency,
        }));
      }),

    previousPeriod: (scope, entityId, period) =>
      withScope(db, scope, async (trx) => {
        const result = await sql<{ period: string | null }>`
          SELECT to_char(max(period), 'YYYY-MM') AS period FROM groupdata.period_version
           WHERE entity_id = ${entityId} AND period < ${toDate(period)}::date`.execute(trx);
        return only(result).period;
      }),

    recordsInUse: (scope, entityId, period) =>
      withScope(db, scope, async (trx) => {
        const result = await sql<SnapshotRow>`
          SELECT ${SNAPSHOT_COLUMNS}
            FROM groupdata.period_version v
            JOIN groupdata.employee_snapshot s
              ON s.upload_id = v.upload_id AND s.period = v.period AND s.entity_id = v.entity_id
            JOIN groupdata.upload u ON u.id = v.upload_id
            JOIN core.entity e ON e.id = s.entity_id
           WHERE v.entity_id = ${entityId} AND v.period = ${toDate(period)}::date
           ORDER BY s.row_number`.execute(trx);
        return result.rows.map(toSnapshot);
      }),

    salaryHistory: (scope, entityId, from, to) =>
      withScope(db, scope, async (trx) => {
        const result = await sql<{
          id: string;
          employee_number: string;
          period: string;
          gross_salary: Buffer;
        }>`
          SELECT s.id, s.employee_number, to_char(s.period, 'YYYY-MM') AS period, s.gross_salary
            FROM groupdata.period_version v
            JOIN groupdata.employee_snapshot s
              ON s.upload_id = v.upload_id AND s.period = v.period AND s.entity_id = v.entity_id
           WHERE v.entity_id = ${entityId}
             AND v.period BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date
           ORDER BY s.employee_number, s.period`.execute(trx);
        return result.rows.map((row) => ({
          employeeNumber: row.employee_number,
          period: row.period,
          grossSalary: cipher.decrypt(row.gross_salary, { ...SNAPSHOT_GROSS, rowId: row.id }),
        }));
      }),

    numbersElsewhere: (scope, entityId, period, numbers) =>
      withScope(db, scope, async (trx) => {
        const result = await sql<{ found: string[] }>`
          SELECT groupdata.employee_numbers_elsewhere(${entityId}::uuid, ${toDate(period)}::date,
                 ${[...numbers]}::text[]) AS found`.execute(trx);
        return only(result).found;
      }),

    recordRejected: (scope, input) =>
      withScope(db, scope, async (trx) => {
        const reference = await insertUpload(trx, scope, input, {
          status: 'rejected',
          version: null,
          comparison: null,
          flags: 0,
        });
        await recordAudit(trx, scope.userId, {
          action: 'group_upload.rejected',
          entityId: input.entityId,
          subjectType: 'group_upload',
          subjectId: input.id,
          details: {
            reference,
            period: input.period,
            rows: input.rows,
            errors: input.issues.filter((issue) => issue.severity === 'error').length,
          },
        });
        return writtenUpload(trx, input.id);
      }),

    accept: (scope, input) =>
      withScope(db, scope, async (trx) => {
        // One version at a time per subsidiary and month: the lock orders concurrent uploads.
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.entityId}:${input.period}`}))`.execute(
          trx,
        );
        const latest = await sql<{
          version: number | null;
          upload_id: string | null;
          sha256: string | null;
        }>`
          SELECT max(version)::int AS version,
                 (SELECT upload_id FROM groupdata.period_version
                   WHERE entity_id = ${input.entityId} AND period = ${toDate(input.period)}::date) AS upload_id,
                 (SELECT u.sha256 FROM groupdata.period_version v JOIN groupdata.upload u ON u.id = v.upload_id
                   WHERE v.entity_id = ${input.entityId} AND v.period = ${toDate(input.period)}::date) AS sha256
            FROM groupdata.upload
           WHERE entity_id = ${input.entityId} AND period = ${toDate(input.period)}::date`.execute(
          trx,
        );
        const previous = only(latest);
        // The same file again (a double submit, or a re-upload by mistake) adds no version.
        if (previous.sha256 === input.file.sha256) throw new GroupDataError('duplicate_file');
        const version = (previous.version ?? 0) + 1;
        const reference = await insertUpload(trx, scope, input, {
          status: 'accepted',
          version,
          comparison: input.comparison,
          flags: input.flags.length,
        });
        for (let start = 0; start < input.records.length; start += BATCH) {
          const rows = input.records.slice(start, start + BATCH).map((record) => {
            const id = randomUUID();
            return sql`(${id}, ${input.id}, ${input.entityId}, ${toDate(input.period)}::date,
              ${record.rowNumber}, ${record.employeeNumber}, ${record.fullName}, ${record.department},
              ${record.designation}, ${record.grade},
              ${cipher.encrypt(record.grossSalary, { ...SNAPSHOT_GROSS, rowId: id })},
              ${record.basicSalary === null ? null : cipher.encrypt(record.basicSalary, { ...SNAPSHOT_BASIC, rowId: id })},
              ${record.currency}, ${record.dateJoined}::date, ${record.dateOfBirth}::date,
              ${record.gender}, ${record.nationality}, ${record.status}, ${record.dateLeft}::date,
              ${record.costCentre}, ${JSON.stringify(record.extra)}::jsonb)`;
          });
          await sql`
            INSERT INTO groupdata.employee_snapshot (id, upload_id, entity_id, period, row_number,
              employee_number, full_name, department, designation, grade, gross_salary, basic_salary,
              currency, date_joined, date_of_birth, gender, nationality, status, date_left,
              cost_centre, extra)
            VALUES ${sql.join(rows)}`.execute(trx);
        }
        if (previous.upload_id !== null) {
          await sql`UPDATE groupdata.upload SET status = 'superseded' WHERE id = ${previous.upload_id}`.execute(
            trx,
          );
          // Open flags of the replaced version no longer describe the data in use.
          await sql`UPDATE groupdata.anomaly_flag
                       SET status = 'resolved', resolved_reason = 'superseded',
                           resolved_at = clock_timestamp(), updated_at = clock_timestamp()
                     WHERE upload_id = ${previous.upload_id} AND status <> 'resolved'`.execute(trx);
        }
        await sql`
          INSERT INTO groupdata.period_version (entity_id, period, upload_id, version, accepted_at)
          VALUES (${input.entityId}, ${toDate(input.period)}::date, ${input.id}, ${version}, clock_timestamp())
          ON CONFLICT (entity_id, period) DO UPDATE
            SET upload_id = EXCLUDED.upload_id, version = EXCLUDED.version,
                accepted_at = EXCLUDED.accepted_at`.execute(trx);
        await sql`DELETE FROM groupdata.period_summary
                   WHERE entity_id = ${input.entityId} AND period = ${toDate(input.period)}::date`.execute(
          trx,
        );
        if (input.summary.length > 0) {
          await sql`
            INSERT INTO groupdata.period_summary (entity_id, period, department, upload_id, metrics)
            VALUES ${sql.join(
              input.summary.map(
                (row) => sql`(${input.entityId}, ${toDate(input.period)}::date, ${row.department},
                  ${input.id}, ${JSON.stringify(row.metrics)}::jsonb)`,
              ),
            )}`.execute(trx);
        }
        for (const flag of input.flags) {
          const id = randomUUID();
          const sequence = await sql<{
            n: string;
          }>`SELECT nextval('groupdata.flag_number_seq')::text AS n`.execute(trx);
          await sql`
            INSERT INTO groupdata.anomaly_flag (id, reference, entity_id, period, upload_id, rule_code,
              employee_number, employee_name, field, detail, owner_id, owner_name)
            VALUES (${id}, ${`AN-${only(sequence).n.padStart(4, '0')}`}, ${input.entityId},
              ${toDate(input.period)}::date, ${input.id}, ${flag.ruleCode}, ${flag.employeeNumber},
              ${flag.employeeName}, ${flag.field},
              ${cipher.encrypt(JSON.stringify(flag.detail), { ...FLAG_DETAIL, rowId: id })},
              ${scope.userId}, ${input.uploaderName})`.execute(trx);
          // The flag's activity starts here (D7 flag detail); never its values.
          await recordAudit(trx, scope.userId, {
            action: 'anomaly_flag.raised',
            entityId: input.entityId,
            subjectType: 'anomaly_flag',
            subjectId: id,
            details: { rule: flag.ruleCode, upload: reference },
          });
        }
        // The newest month in use for the subsidiary drives the employee master.
        const newest = await sql<{ newest: boolean }>`
          SELECT NOT EXISTS (SELECT 1 FROM groupdata.period_version
                              WHERE entity_id = ${input.entityId}
                                AND period > ${toDate(input.period)}::date) AS newest`.execute(trx);
        if (only(newest).newest) {
          await refreshMaster(trx, scope, input.entityId, input.records);
        }
        await recordAudit(trx, scope.userId, {
          action: 'group_upload.accepted',
          entityId: input.entityId,
          subjectType: 'group_upload',
          subjectId: input.id,
          details: {
            reference,
            period: input.period,
            version,
            rows: input.records.length,
            flags: input.flags.length,
            replaced: previous.upload_id,
          },
        });
        const upload = await writtenUpload(trx, input.id);
        await insertNotifications(
          trx,
          input.notifications({
            reference,
            entityId: input.entityId,
            entityCode: upload.entity.code,
            period: input.period,
            version,
            uploadId: input.id,
            flags: input.flags.length,
          }),
        );
        return upload;
      }),

    uploads: (scope, query) =>
      withScope(db, scope, async (trx) => {
        const conditions = [sql<boolean>`true`];
        if (query.entityId !== undefined)
          conditions.push(sql<boolean>`u.entity_id = ${query.entityId}`);
        if (query.period !== undefined) {
          conditions.push(sql<boolean>`u.period = ${toDate(query.period)}::date`);
        }
        const where = sql.join(conditions, sql` AND `);
        const total = await sql<{ n: number }>`
          SELECT count(*)::int AS n FROM groupdata.upload u WHERE ${where}`.execute(trx);
        const rows = await sql<UploadRow>`
          SELECT ${UPLOAD_COLUMNS}
            FROM groupdata.upload u
            JOIN core.entity e ON e.id = u.entity_id
            JOIN groupdata.field_template t ON t.id = u.template_id
           WHERE ${where}
           ORDER BY u.uploaded_at DESC, u.reference DESC
           LIMIT ${query.limit} OFFSET ${query.offset}`.execute(trx);
        return { total: only(total).n, items: rows.rows.map(toUpload) };
      }),

    upload: (scope, id) => withScope(db, scope, (trx) => uploadRow(trx, id)),

    uploadFile: (scope, id) =>
      withScope(db, scope, async (trx) => {
        const result = await sql<{
          object_key: string;
          file_name: string;
          media_type: string;
          entity_id: string;
          reference: string;
        }>`
          SELECT object_key, file_name, media_type, entity_id, reference
            FROM groupdata.upload WHERE id = ${id}`.execute(trx);
        const [row] = result.rows;
        if (row === undefined) return null;
        await recordAudit(trx, scope.userId, {
          action: 'group_upload.downloaded',
          entityId: row.entity_id,
          subjectType: 'group_upload',
          subjectId: id,
          details: { reference: row.reference },
        });
        return { objectKey: row.object_key, fileName: row.file_name, mediaType: row.media_type };
      }),

    employees: (scope, query) =>
      withScope(db, scope, async (trx) => {
        const conditions = [sql<boolean>`v.period = ${toDate(query.period)}::date`];
        if (query.entityId !== undefined)
          conditions.push(sql<boolean>`v.entity_id = ${query.entityId}`);
        const scoped = sql.join(conditions, sql` AND `);
        const filters = [...conditions];
        if (query.department !== undefined)
          filters.push(sql<boolean>`s.department = ${query.department}`);
        if (query.search !== undefined) {
          const pattern = contains(query.search);
          filters.push(
            sql<boolean>`(lower(s.full_name) LIKE lower(${pattern}) OR lower(s.employee_number) LIKE lower(${pattern}))`,
          );
        }
        const where = sql.join(filters, sql` AND `);
        const from = sql`groupdata.period_version v
          JOIN groupdata.employee_snapshot s
            ON s.upload_id = v.upload_id AND s.period = v.period AND s.entity_id = v.entity_id
          JOIN groupdata.upload u ON u.id = v.upload_id
          JOIN core.entity e ON e.id = s.entity_id`;
        const total = await sql<{
          n: number;
        }>`SELECT count(*)::int AS n FROM ${from} WHERE ${where}`.execute(trx);
        const rows = await sql<SnapshotRow>`
          SELECT ${SNAPSHOT_COLUMNS} FROM ${from} WHERE ${where}
           ORDER BY e.code, s.full_name, s.employee_number
           LIMIT ${query.limit} OFFSET ${query.offset}`.execute(trx);
        const departments = await sql<{ department: string }>`
          SELECT DISTINCT s.department FROM ${from} WHERE ${scoped} ORDER BY s.department`.execute(
          trx,
        );
        const counts = await sql<{ entities: number; with_data: number; versions: number }>`
          SELECT (SELECT count(*)::int FROM core.entity WHERE deleted_at IS NULL
                    ${query.entityId === undefined ? sql`` : sql`AND id = ${query.entityId}`}) AS entities,
                 (SELECT count(*)::int FROM groupdata.period_version v WHERE ${scoped}) AS with_data,
                 (SELECT count(*)::int FROM groupdata.upload u
                   WHERE u.period = ${toDate(query.period)}::date
                     ${query.entityId === undefined ? sql`` : sql`AND u.entity_id = ${query.entityId}`}) AS versions`.execute(
          trx,
        );
        const last = await sql<{ accepted_at: Date; code: string; version: number }>`
          SELECT v.accepted_at, e.code, v.version FROM groupdata.period_version v
            JOIN core.entity e ON e.id = v.entity_id
           WHERE ${scoped} ORDER BY v.accepted_at DESC LIMIT 1`.execute(trx);
        const count = only(counts);
        const [latest] = last.rows;
        return {
          items: rows.rows.map(toSnapshot),
          total: only(total).n,
          departments: departments.rows.map((row) => row.department),
          entities: count.entities,
          entitiesWithData: count.with_data,
          versions: count.versions,
          lastChange:
            latest === undefined
              ? null
              : { at: latest.accepted_at, entityCode: latest.code, version: latest.version },
        };
      }),

    history: (scope, recordId) =>
      withScope(db, scope, async (trx) => {
        const anchor = await sql<{ entity_id: string; employee_number: string }>`
          SELECT entity_id, employee_number FROM groupdata.employee_snapshot WHERE id = ${recordId}`.execute(
          trx,
        );
        const [found] = anchor.rows;
        if (found === undefined) return null;
        const rows = await sql<SnapshotRow & { uploaded_by_name: string; uploaded_at: Date }>`
          SELECT ${SNAPSHOT_COLUMNS}, u.uploaded_by_name, u.uploaded_at
            FROM groupdata.employee_snapshot s
            JOIN groupdata.upload u ON u.id = s.upload_id
            JOIN core.entity e ON e.id = s.entity_id
           WHERE s.entity_id = ${found.entity_id} AND s.employee_number = ${found.employee_number}
           ORDER BY s.period DESC, u.version DESC`.execute(trx);
        return {
          records: rows.rows.map((row) => ({
            ...toSnapshot(row),
            uploadedByName: row.uploaded_by_name,
            uploadedAt: row.uploaded_at,
          })),
        };
      }),

    summaries: (scope, query) =>
      withScope(db, scope, async (trx) => {
        const result = await sql<{
          entity_id: string;
          code: string;
          period: string;
          department: string;
          metrics: Record<string, unknown>;
        }>`
          SELECT p.entity_id, e.code, to_char(p.period, 'YYYY-MM') AS period, p.department, p.metrics
            FROM groupdata.period_summary p
            JOIN core.entity e ON e.id = p.entity_id
           WHERE p.period BETWEEN ${toDate(query.from)}::date AND ${toDate(query.to)}::date
             ${query.entityId === undefined ? sql`` : sql`AND p.entity_id = ${query.entityId}`}
           ORDER BY p.period, e.code, p.department`.execute(trx);
        return result.rows.map((row) => ({
          entityId: row.entity_id,
          entityCode: row.code,
          period: row.period,
          department: row.department,
          metrics: row.metrics,
        }));
      }),

    extract: (scope, query, format) =>
      withScope(db, scope, async (trx) => {
        const conditions = [sql<boolean>`s.period = ${toDate(query.period)}::date`];
        if (query.entityId !== undefined)
          conditions.push(sql<boolean>`s.entity_id = ${query.entityId}`);
        if (!query.allVersions) {
          conditions.push(
            sql<boolean>`EXISTS (SELECT 1 FROM groupdata.period_version v
                                  WHERE v.upload_id = s.upload_id AND v.period = s.period)`,
          );
        }
        const rows = await sql<
          SnapshotRow & { uploaded_by_name: string; uploaded_at: Date; file_name: string }
        >`
          SELECT ${SNAPSHOT_COLUMNS}, u.uploaded_by_name, u.uploaded_at, u.file_name
            FROM groupdata.employee_snapshot s
            JOIN groupdata.upload u ON u.id = s.upload_id
            JOIN core.entity e ON e.id = s.entity_id
           WHERE ${sql.join(conditions, sql` AND `)}
           ORDER BY e.code, u.version, s.row_number`.execute(trx);
        await recordAudit(trx, scope.userId, {
          action: 'group_data.extracted',
          entityId: query.entityId ?? null,
          subjectType: 'report',
          subjectId: 'RP-08',
          details: {
            format,
            period: query.period,
            rows: rows.rows.length,
            allVersions: query.allVersions,
          },
        });
        return rows.rows.map((row) => ({
          record: toSnapshot(row),
          uploadedByName: row.uploaded_by_name,
          uploadedAt: row.uploaded_at,
          fileName: row.file_name,
        }));
      }),
  };
}

export type GroupDataErrorReason = 'version_conflict' | 'not_found' | 'duplicate_file';

/** An expected refusal, mapped to 4xx by the API. */
export class GroupDataError extends Error {
  constructor(readonly reason: GroupDataErrorReason) {
    super(reason);
    this.name = 'GroupDataError';
  }
}
