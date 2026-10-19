import type { TemplateFieldRecord } from '@peopleforge/db';
import { describe, expect, it } from 'vitest';
import {
  snapshot,
  TEMPLATE_FIELDS,
  TEMPLATE_HEADERS,
  VALID_ROW,
} from '../../test-support/group-data.js';
import type { CellValue, Sheet } from './spreadsheet.js';
import { periodEnd, toDecimal, toIsoDate, validateSheet } from './validate.js';

// Checking uploads against the field template (R2-01, R2-02, NFR-DQ-01): problems by row and
// field, never values; any error rejects the whole file.

type OkSheet = Extract<Sheet, { ok: true }>;

function sheet(rows: CellValue[][], headers: string[] = TEMPLATE_HEADERS): OkSheet {
  return {
    ok: true,
    headers,
    rows: rows.map((cells, index) => ({ rowNumber: index + 2, cells })),
    formulaCells: [],
  };
}

/** VALID_ROW with some fields changed, by template key. */
function row(changes: Record<string, CellValue> = {}): CellValue[] {
  const changed = new Map(Object.entries(changes));
  return VALID_ROW.map((value, index) => {
    const key = TEMPLATE_FIELDS[index]?.key ?? '';
    return changed.has(key) ? (changed.get(key) ?? null) : value === '' ? null : value;
  });
}

const codes = (result: { issues: { row: number | null; field: string | null; code: string }[] }) =>
  result.issues.map((issue) => [issue.row, issue.field, issue.code]);

describe('periodEnd', () => {
  it('is the last day of the month, leap years included', () => {
    expect(periodEnd('2026-09')).toBe('2026-09-30');
    expect(periodEnd('2028-02')).toBe('2028-02-29');
    expect(periodEnd('2026-12')).toBe('2026-12-31');
  });
});

describe('toIsoDate', () => {
  it('reads Excel dates (UTC), ISO and day/month/year text', () => {
    expect(toIsoDate(new Date(Date.UTC(2026, 8, 30)))).toBe('2026-09-30');
    expect(toIsoDate(' 2026-09-30 ')).toBe('2026-09-30');
    expect(toIsoDate('1/9/2026')).toBe('2026-09-01');
  });

  it('refuses impossible dates, old years, numbers and other text', () => {
    expect(toIsoDate(new Date(Number.NaN))).toBeNull();
    expect(toIsoDate('2026-02-30')).toBeNull();
    expect(toIsoDate('1899-12-31')).toBeNull();
    expect(toIsoDate('September 2026')).toBeNull();
    expect(toIsoDate(45000)).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });
});

describe('toDecimal', () => {
  it('reads numbers (2 places) and text with thousands separators', () => {
    expect(toDecimal(14200.5)).toBe('14200.5');
    expect(toDecimal(0.125)).toBe('0.13');
    expect(toDecimal(' 14,200.50 ')).toBe('14200.50');
  });

  it('refuses text that is not an amount, and dates', () => {
    expect(toDecimal('AED 100')).toBeNull();
    expect(toDecimal('-5')).toBeNull();
    expect(toDecimal(new Date())).toBeNull();
    expect(toDecimal(null)).toBeNull();
  });
});

describe('validateSheet [R2-02]', () => {
  it('accepts a valid file as typed records', () => {
    const result = validateSheet(TEMPLATE_FIELDS, sheet([row()]), '2026-09');
    expect(result).toEqual({ records: [snapshot()], issues: [] });
  });

  it('matches headers by key or label, loosely, and Arabic labels; unknown columns warn', () => {
    const fields: TemplateFieldRecord[] = TEMPLATE_FIELDS.map((field) =>
      field.key === 'full_name'
        ? { ...field, label: { en: 'Full name', ar: 'الاسم الكامل' } }
        : field,
    );
    const headers = [
      'EMPLOYEE_ID',
      'الاسم الكامل',
      ...TEMPLATE_HEADERS.slice(2).map((header) => header.toUpperCase()),
      'Notes',
      '',
    ];
    const result = validateSheet(
      fields,
      sheet([[...row(), 'free text', null]], headers),
      '2026-09',
    );
    expect(result.records).toEqual([snapshot()]);
    expect(codes(result)).toEqual([[1, null, 'unknown_column']]);
    expect(result.issues[0]?.severity).toBe('warning');
  });

  it('rejects missing required columns and duplicate columns', () => {
    const missing = validateSheet(
      TEMPLATE_FIELDS,
      sheet([row().slice(1)], TEMPLATE_HEADERS.slice(1)),
      '2026-09',
    );
    expect(codes(missing)).toEqual([[null, 'employee_number', 'missing_column']]);
    expect(missing.records).toEqual([]);
    const duplicate = validateSheet(
      TEMPLATE_FIELDS,
      sheet([[...row(), 'EMP-1']], [...TEMPLATE_HEADERS, 'employee number']),
      '2026-09',
    );
    expect(codes(duplicate)).toEqual([[1, 'employee_number', 'duplicate_column']]);
  });

  it('rejects formulas, naming the field when the column is known', () => {
    const result = validateSheet(
      TEMPLATE_FIELDS,
      {
        ...sheet([[...row(), null]], [...TEMPLATE_HEADERS, 'Notes']),
        formulaCells: [
          { row: 2, column: 6 },
          { row: 2, column: 16 },
        ],
      },
      '2026-09',
    );
    expect(codes(result)).toEqual([
      [1, null, 'unknown_column'],
      [2, 'gross_salary', 'formula'],
      [2, null, 'formula'],
    ]);
  });

  it('rejects a file without rows', () => {
    expect(codes(validateSheet(TEMPLATE_FIELDS, sheet([]), '2026-09'))).toEqual([
      [null, null, 'empty_file'],
    ]);
  });

  it('reports each bad value by row and field, and rejects the whole file', () => {
    const result = validateSheet(
      TEMPLATE_FIELDS,
      sheet([
        row({ employee_number: null, gross_salary: 'abc', date_joined: '31/31/2020' }),
        row({ gender: 'unknown', full_name: 'x'.repeat(201), currency: 'XYZ' }),
        row({ employee_number: 'EMP-1', status: 'Left', date_left: null }),
        row({
          employee_number: 'EMP-2',
          date_joined: '2026-10-01',
          date_left: '2026-10-02',
          status: 'left',
        }),
        row({ employee_number: 'EMP-3', date_of_birth: '2021-01-01', date_left: '2019-01-01' }),
        row({ employee_number: 'emp-3' }),
      ]),
      '2026-09',
    );
    expect(codes(result)).toEqual([
      [2, 'employee_number', 'required'],
      [2, 'gross_salary', 'invalid_number'],
      [2, 'date_joined', 'invalid_date'],
      [3, 'full_name', 'too_long'],
      [3, 'gender', 'not_allowed'],
      [3, 'currency', 'invalid_currency'],
      [4, 'date_left', 'left_without_date'],
      [5, 'date_joined', 'future_date'],
      [5, 'date_left', 'future_date'],
      [6, 'date_of_birth', 'date_order'],
      [6, 'date_left', 'date_order'],
      [7, 'employee_number', 'duplicate_employee'],
    ]);
    expect(result.records).toEqual([]);
    expect(JSON.stringify(result.issues)).not.toContain('abc');
  });

  it('takes enum values in any case, optional fields empty and added fields as extras', () => {
    const fields: TemplateFieldRecord[] = [
      ...TEMPLATE_FIELDS,
      {
        key: 'project',
        label: { en: 'Project' },
        type: 'text',
        required: false,
        core: false,
        allowedValues: [],
        palmHrField: null,
      },
      {
        key: 'band_note',
        label: { en: 'Band note' },
        type: 'text',
        required: false,
        core: false,
        allowedValues: [],
        palmHrField: null,
      },
    ];
    const result = validateSheet(
      fields,
      sheet(
        [
          [
            ...row({
              gender: 'FEMALE',
              status: 'Left',
              date_left: '2026-09-15',
              basic_salary: null,
              designation: 'Analyst',
              currency: 'aed',
              nationality: null,
              cost_centre: null,
              date_of_birth: '1990-05-01',
            }),
            'P-7',
            null,
          ],
        ],
        [...TEMPLATE_HEADERS, 'Project', 'Band note'],
      ),
      '2026-09',
    );
    expect(result.records).toEqual([
      snapshot({
        gender: 'female',
        status: 'left',
        dateLeft: '2026-09-15',
        basicSalary: null,
        nationality: null,
        costCentre: null,
        currency: 'AED',
        extra: { project: 'P-7' },
      }),
    ]);
  });

  it('caps text of added fields at 200 characters and of core fields at their limit', () => {
    const fields: TemplateFieldRecord[] = [
      ...TEMPLATE_FIELDS,
      {
        key: 'project',
        label: { en: 'Project' },
        type: 'text',
        required: false,
        core: false,
        allowedValues: [],
        palmHrField: null,
      },
    ];
    const result = validateSheet(
      fields,
      sheet(
        [[...row({ grade: 'G'.repeat(21) }), 'p'.repeat(201)]],
        [...TEMPLATE_HEADERS, 'Project'],
      ),
      '2026-09',
    );
    expect(codes(result)).toEqual([
      [2, 'grade', 'too_long'],
      [2, 'project', 'too_long'],
    ]);
  });

  it('requires the fields dashboards need even if the template marks them optional', () => {
    const optional = TEMPLATE_FIELDS.map((field) =>
      field.key === 'department' ? { ...field, required: false } : field,
    );
    expect(codes(validateSheet(optional, sheet([row({ department: null })]), '2026-09'))).toEqual([
      [2, 'department', 'required'],
    ]);
    const without = TEMPLATE_FIELDS.filter((field) => field.key !== 'department');
    expect(
      codes(
        validateSheet(
          without,
          sheet(
            [row()],
            TEMPLATE_HEADERS.filter((header) => header !== 'Department'),
          ),
          '2026-09',
        ),
      ),
    ).toEqual([[null, 'department', 'missing_column']]);
  });

  it('reads a date cell in a text field as its ISO date, and a short row as empty cells', () => {
    const joined = new Date(Date.UTC(2020, 0, 15));
    const result = validateSheet(
      TEMPLATE_FIELDS,
      sheet([row({ designation: joined }), row({ employee_number: 'EMP-2' }).slice(0, 13)]),
      '2026-09',
    );
    expect(result.records.map((record) => [record.designation, record.costCentre])).toEqual([
      ['2020-01-15', 'CC-10'],
      ['Analyst', null],
    ]);
  });

  it('leaves optional fields without a column empty', () => {
    const result = validateSheet(
      TEMPLATE_FIELDS,
      sheet([row().slice(0, 14)], TEMPLATE_HEADERS.slice(0, 14)),
      '2026-09',
    );
    expect(result.records[0]?.costCentre).toBeNull();
  });
});
