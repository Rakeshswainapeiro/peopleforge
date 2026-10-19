import {
  ALWAYS_REQUIRED,
  DecimalString,
  type UploadIssue,
  type UploadIssueCode,
} from '@peopleforge/contracts';
import type { SnapshotInput, TemplateFieldRecord } from '@peopleforge/db';
import type { CellValue, Sheet } from './spreadsheet.js';

/**
 * Checking an upload against the field template (R2-01, R2-02, NFR-DQ-01). Every problem is
 * reported with its row and field, never the cell's value (it may be pay or personal data).
 * Errors reject the whole file, so a subsidiary's data is either all in or untouched.
 */

/** Longest text each core field takes (the database's limits). */
const MAX_LENGTH = new Map<string, number>([
  ['employee_number', 40],
  ['full_name', 200],
  ['department', 80],
  ['designation', 120],
  ['grade', 20],
  ['nationality', 60],
  ['status', 20],
  ['gender', 20],
  ['cost_centre', 60],
]);
const MAX_EXTRA_LENGTH = 200;

const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

/** Fields the dashboards are built on are required whatever the template says. */
const MUST_HAVE: ReadonlySet<string> = new Set(ALWAYS_REQUIRED);
const isRequired = (field: TemplateFieldRecord) => field.required || MUST_HAVE.has(field.key);

export interface Validation {
  records: SnapshotInput[];
  issues: UploadIssue[];
}

/** Header text compared loosely: case, spaces and punctuation don't matter. */
function normalise(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s_\-.()]+/gu, ' ')
    .trim();
}

/** The last day of a "2026-09" period, as an ISO date. */
export function periodEnd(period: string): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A date cell or text (2026-09-30 or 30/09/2026) as an ISO date; null if not a date. */
export function toIsoDate(value: CellValue): string | null {
  if (value instanceof Date) {
    // Excel dates carry no time zone: exceljs reads them as UTC midnight.
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(text);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dmy
      ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
      : [0, 0, 0];
  if (year < 1900 || !isRealDate(year, month, day)) return null;
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A number cell or text ("14,200.50") as a decimal string with at most 2 places. */
export function toDecimal(value: CellValue): string | null {
  const text =
    typeof value === 'number'
      ? String(Math.round(value * 100) / 100)
      : typeof value === 'string'
        ? value.trim().replace(/,/gu, '')
        : '';
  return DecimalString.safeParse(text).success ? text : null;
}

function asText(value: CellValue): string {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).normalize('NFC').trim();
}

interface ColumnMap {
  /** Template field key → column index. */
  columns: Map<string, number>;
  issues: UploadIssue[];
}

function mapColumns(fields: readonly TemplateFieldRecord[], headers: readonly string[]): ColumnMap {
  const issues: UploadIssue[] = [];
  const byName = new Map<string, TemplateFieldRecord>();
  for (const field of fields) {
    byName.set(normalise(field.key), field);
    byName.set(normalise(field.label.en), field);
    if (field.label.ar !== undefined) byName.set(normalise(field.label.ar), field);
  }
  const columns = new Map<string, number>();
  headers.forEach((header, index) => {
    if (header === '') return;
    const field = byName.get(normalise(header));
    if (field === undefined) {
      issues.push({ row: 1, field: null, code: 'unknown_column', severity: 'warning' });
    } else if (columns.has(field.key)) {
      issues.push({ row: 1, field: field.key, code: 'duplicate_column', severity: 'error' });
    } else {
      columns.set(field.key, index);
    }
  });
  for (const field of fields) {
    if (isRequired(field) && !columns.has(field.key)) {
      issues.push({ row: null, field: field.key, code: 'missing_column', severity: 'error' });
    }
  }
  // A template without a field every record needs can't produce records (Settings refuses it).
  const keys = new Set(fields.map((field) => field.key));
  for (const key of ALWAYS_REQUIRED) {
    if (!keys.has(key))
      issues.push({ row: null, field: key, code: 'missing_column', severity: 'error' });
  }
  return { columns, issues };
}

type Parsed = Map<string, string>;

/** One field's value checked against its template definition. */
function checkField(
  field: TemplateFieldRecord,
  value: CellValue,
): { value: string } | { code: UploadIssueCode } | null {
  const text = asText(value);
  if (text === '') return isRequired(field) ? { code: 'required' } : null;
  switch (field.type) {
    case 'date': {
      const date = toIsoDate(value);
      return date === null ? { code: 'invalid_date' } : { value: date };
    }
    case 'decimal': {
      const decimal = toDecimal(value);
      return decimal === null ? { code: 'invalid_number' } : { value: decimal };
    }
    case 'enum': {
      const match = field.allowedValues.find((allowed) => normalise(allowed) === normalise(text));
      return match === undefined ? { code: 'not_allowed' } : { value: match };
    }
    case 'text': {
      const max = field.core ? (MAX_LENGTH.get(field.key) ?? MAX_EXTRA_LENGTH) : MAX_EXTRA_LENGTH;
      // Code points, as the database's char_length counts them.
      return Array.from(text).length > max ? { code: 'too_long' } : { value: text };
    }
  }
}

/** Rules across fields of one row (status and dates). */
function rowRules(values: Parsed, period: string): { field: string; code: UploadIssueCode }[] {
  const problems: { field: string; code: UploadIssueCode }[] = [];
  const end = periodEnd(period);
  const joined = values.get('date_joined');
  const left = values.get('date_left');
  const born = values.get('date_of_birth');
  const currency = values.get('currency');
  if (currency !== undefined && !CURRENCIES.has(currency.toUpperCase())) {
    problems.push({ field: 'currency', code: 'invalid_currency' });
  }
  if (values.get('status') === 'left' && left === undefined) {
    problems.push({ field: 'date_left', code: 'left_without_date' });
  }
  if (joined !== undefined && joined > end)
    problems.push({ field: 'date_joined', code: 'future_date' });
  if (left !== undefined && left > end) problems.push({ field: 'date_left', code: 'future_date' });
  if (born !== undefined && joined !== undefined && born >= joined) {
    problems.push({ field: 'date_of_birth', code: 'date_order' });
  }
  if (joined !== undefined && left !== undefined && left < joined) {
    problems.push({ field: 'date_left', code: 'date_order' });
  }
  return problems;
}

const optional = (values: Parsed, key: string): string | null => values.get(key) ?? null;
/**
 * A field every valid row has: ALWAYS_REQUIRED fields are in the template and non-empty, or the
 * row was refused before this is called.
 */
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by the checks above
const required = (values: Parsed, key: string): string => values.get(key)!;

function toRecord(
  rowNumber: number,
  values: Parsed,
  fields: readonly TemplateFieldRecord[],
): SnapshotInput {
  const extra: Record<string, string> = {};
  for (const field of fields) {
    const value = values.get(field.key);
    if (!field.core && value !== undefined) extra[field.key] = value;
  }
  return {
    rowNumber,
    employeeNumber: required(values, 'employee_number'),
    fullName: required(values, 'full_name'),
    department: required(values, 'department'),
    designation: optional(values, 'designation'),
    grade: required(values, 'grade'),
    grossSalary: required(values, 'gross_salary'),
    basicSalary: optional(values, 'basic_salary'),
    currency: required(values, 'currency').toUpperCase(),
    dateJoined: required(values, 'date_joined'),
    dateOfBirth: optional(values, 'date_of_birth'),
    gender: required(values, 'gender'),
    nationality: optional(values, 'nationality'),
    status: required(values, 'status'),
    dateLeft: optional(values, 'date_left'),
    costCentre: optional(values, 'cost_centre'),
    extra,
  };
}

/** The sheet's rows checked against the template for the given period. */
export function validateSheet(
  fields: readonly TemplateFieldRecord[],
  sheet: Extract<Sheet, { ok: true }>,
  period: string,
): Validation {
  const { columns, issues } = mapColumns(fields, sheet.headers);
  for (const cell of sheet.formulaCells) {
    const field = [...columns].find(([, index]) => index === cell.column - 1)?.[0] ?? null;
    issues.push({ row: cell.row, field, code: 'formula', severity: 'error' });
  }
  if (sheet.rows.length === 0) {
    issues.push({ row: null, field: null, code: 'empty_file', severity: 'error' });
  }
  if (issues.some((issue) => issue.severity === 'error')) return { records: [], issues };

  const records: SnapshotInput[] = [];
  const seen = new Set<string>();
  for (const row of sheet.rows) {
    const values: Parsed = new Map();
    let rowOk = true;
    for (const field of fields) {
      const index = columns.get(field.key);
      const result = checkField(field, index === undefined ? null : (row.cells.at(index) ?? null));
      if (result === null) continue;
      if ('code' in result) {
        issues.push({ row: row.rowNumber, field: field.key, code: result.code, severity: 'error' });
        rowOk = false;
      } else {
        values.set(field.key, result.value);
      }
    }
    for (const problem of rowRules(values, period)) {
      issues.push({
        row: row.rowNumber,
        field: problem.field,
        code: problem.code,
        severity: 'error',
      });
      rowOk = false;
    }
    const number = values.get('employee_number');
    if (number !== undefined && seen.has(number.toUpperCase())) {
      issues.push({
        row: row.rowNumber,
        field: 'employee_number',
        code: 'duplicate_employee',
        severity: 'error',
      });
      rowOk = false;
    }
    if (number !== undefined) seen.add(number.toUpperCase());
    if (rowOk) records.push(toRecord(row.rowNumber, values, fields));
  }
  return issues.some((issue) => issue.severity === 'error')
    ? { records: [], issues }
    : { records, issues };
}
