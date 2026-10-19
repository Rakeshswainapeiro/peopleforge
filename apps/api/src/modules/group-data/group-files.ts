import type { Locale } from '@sirius/shared-types';
import type {
  ExtractRow,
  SnapshotInput,
  TemplateFieldRecord,
  TemplateRecord,
  UploadRecord,
} from '@peopleforge/db';
import { UploadIssueCodeSchema } from '@peopleforge/contracts';
import ExcelJS from 'exceljs';
import type { ApiTranslate } from '../../i18n.js';
import { dateTimeIn } from '../reports/report-labels.js';
import { safeText, sheet } from '../reports/xlsx.js';

/**
 * Files of the group data (R2-01, R2-08, R2-14): the template to fill in, an upload's problem
 * report, and the raw extract (Excel, CSV, Palm HR CSV). Every text cell is neutralised against
 * formula injection; CSV is UTF-8 with a BOM so Arabic names open correctly in Excel
 * (NFR-INT-01).
 */

/** A field's column title in the reader's language (Arabic when the admin gave one). */
export function labelOf(field: TemplateFieldRecord, locale: Locale): string {
  return locale === 'ar' && field.label.ar !== undefined ? field.label.ar : field.label.en;
}

/** A record's value for a template field: core fields by name, added fields from `extra`. */
export function fieldValue(record: SnapshotInput, key: string): string | null {
  switch (key) {
    case 'employee_number':
      return record.employeeNumber;
    case 'full_name':
      return record.fullName;
    case 'department':
      return record.department;
    case 'designation':
      return record.designation;
    case 'grade':
      return record.grade;
    case 'gross_salary':
      return record.grossSalary;
    case 'basic_salary':
      return record.basicSalary;
    case 'currency':
      return record.currency;
    case 'date_joined':
      return record.dateJoined;
    case 'date_of_birth':
      return record.dateOfBirth;
    case 'gender':
      return record.gender;
    case 'nationality':
      return record.nationality;
    case 'status':
      return record.status;
    case 'date_left':
      return record.dateLeft;
    case 'cost_centre':
      return record.costCentre;
    default:
      return new Map(Object.entries(record.extra)).get(key) ?? null;
  }
}

/** Pay fields, hidden from callers without compensation access. */
export const PAY_FIELDS: ReadonlySet<string> = new Set(['gross_salary', 'basic_salary']);

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** The template to fill in: a header row to complete, and a sheet describing each field. */
export async function templateWorkbook(
  template: TemplateRecord,
  t: ApiTranslate,
  locale: Locale,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeopleForge';
  sheet(
    workbook,
    t('groupData.templateSheet'),
    template.fields.map((field) => ({ header: labelOf(field, locale), width: 20 })),
    [],
  );
  const yesNo = (value: boolean) => (value ? t('groupData.yes') : t('groupData.no'));
  sheet(
    workbook,
    t('groupData.fieldsSheet'),
    [
      { header: t('groupData.colField'), width: 28 },
      { header: t('groupData.colKey'), width: 20 },
      { header: t('groupData.colType'), width: 34 },
      { header: t('groupData.colRequired'), width: 10 },
      { header: t('groupData.colAllowed'), width: 30 },
      { header: t('groupData.colPalmHr'), width: 20 },
    ],
    [
      ...template.fields.map((field) => [
        labelOf(field, locale),
        field.key,
        t(`groupData.types.${field.type}`),
        yesNo(field.required),
        field.allowedValues.join(', '),
        field.palmHrField ?? '',
      ]),
      [],
      [t('groupData.fieldsNote', { version: template.version })],
    ],
  );
  return toBuffer(workbook);
}

/** Every problem of an upload by row and column, in the reader's language (R2-01). */
export async function issuesWorkbook(
  upload: UploadRecord,
  fields: readonly TemplateFieldRecord[],
  t: ApiTranslate,
  locale: Locale,
): Promise<Buffer> {
  const labels = new Map(fields.map((field) => [field.key, labelOf(field, locale)]));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeopleForge';
  sheet(
    workbook,
    t('groupData.issuesSheet'),
    [
      { header: t('groupData.colRow'), width: 10 },
      { header: t('groupData.colColumn'), width: 28 },
      { header: t('groupData.colSeverity'), width: 12 },
      { header: t('groupData.colProblem'), width: 70 },
    ],
    upload.issues.map((issue) => [
      issue.row === null
        ? t('groupData.wholeFile')
        : issue.row === 1
          ? t('groupData.header')
          : issue.row,
      issue.field === null ? '' : (labels.get(issue.field) ?? issue.field),
      t(`groupData.severity.${issue.severity}`),
      t(`groupData.issues.${UploadIssueCodeSchema.parse(issue.code)}`),
    ]),
  );
  return toBuffer(workbook);
}

export interface ExtractOptions {
  fields: readonly TemplateFieldRecord[];
  /** Pay values included (employee_data:read_compensation). */
  compensation: boolean;
  t: ApiTranslate;
  locale: Locale;
}

/** The value of a field as the caller may see it. */
function visible(row: ExtractRow, key: string, compensation: boolean): string {
  return !compensation && PAY_FIELDS.has(key) ? '' : (fieldValue(row.record, key) ?? '');
}

/** RP-08 columns: where each row came from, then the template fields. */
function extractTable(rows: readonly ExtractRow[], options: ExtractOptions) {
  const { t, locale } = options;
  const at = dateTimeIn(locale, '');
  const status = (value: string) =>
    value === 'accepted'
      ? t('groupData.uploadStatus.accepted')
      : value === 'superseded'
        ? t('groupData.uploadStatus.superseded')
        : t('groupData.uploadStatus.rejected');
  const headers = [
    t('groupData.colSubsidiary'),
    t('groupData.colPeriod'),
    t('groupData.colUpload'),
    t('groupData.colVersion'),
    t('groupData.colVersionStatus'),
    t('groupData.colUploadedBy'),
    t('groupData.colUploadedAt'),
    t('groupData.colFile'),
    t('groupData.colSourceRow'),
    ...options.fields.map((field) => labelOf(field, locale)),
  ];
  const body = rows.map((row) => [
    row.record.entityCode,
    row.record.period,
    row.record.upload.reference,
    row.record.upload.version,
    status(row.record.upload.status),
    row.uploadedByName,
    at(row.uploadedAt),
    row.fileName,
    row.record.rowNumber,
    ...options.fields.map((field) => visible(row, field.key, options.compensation)),
  ]);
  return { headers, body };
}

export async function extractWorkbook(
  rows: readonly ExtractRow[],
  options: ExtractOptions,
): Promise<Buffer> {
  const { headers, body } = extractTable(rows, options);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeopleForge';
  sheet(
    workbook,
    options.t('groupData.extractSheet'),
    headers.map((header) => ({ header, width: 18 })),
    body,
  );
  return toBuffer(workbook);
}

/** One CSV field: neutralised, quoted when needed (RFC 4180). */
function csvField(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : safeText(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** UTF-8 byte order mark: Excel reads the file as UTF-8 (Arabic names intact). */
const BOM = '\uFEFF';

function csv(rows: readonly (readonly (string | number)[])[]): Buffer {
  const text = rows.map((row) => row.map(csvField).join(',')).join('\r\n');
  return Buffer.from(`${BOM}${text}\r\n`, 'utf8');
}

export function extractCsv(rows: readonly ExtractRow[], options: ExtractOptions): Buffer {
  const { headers, body } = extractTable(rows, options);
  return csv([headers, ...body]);
}

/**
 * The Palm HR–compatible extract (R2-14): template fields only, headed by the mapped Palm HR
 * field names (the template key until mapped, BRD A7). Phase 1 has no live Palm HR connection.
 */
export function palmHrCsv(rows: readonly ExtractRow[], options: ExtractOptions): Buffer {
  return csv([
    options.fields.map((field) => field.palmHrField ?? field.key),
    ...rows.map((row) =>
      options.fields.map((field) => visible(row, field.key, options.compensation)),
    ),
  ]);
}
