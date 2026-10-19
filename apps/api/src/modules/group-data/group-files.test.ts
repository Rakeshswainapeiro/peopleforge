import type { ExtractRow, TemplateFieldRecord } from '@peopleforge/db';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  snapshot,
  snapshotRecord,
  TEMPLATE,
  TEMPLATE_FIELDS,
  uploadRecord,
} from '../../test-support/group-data.js';
import { apiTranslator } from '../../i18n.js';
import {
  extractCsv,
  extractWorkbook,
  fieldValue,
  issuesWorkbook,
  labelOf,
  palmHrCsv,
  templateWorkbook,
} from './group-files.js';

// Files of the group data (R2-01, R2-08, R2-14, NFR-INT-01): template, problem report and raw
// extract; formula injection neutralised; CSV with a BOM.

const en = apiTranslator('en');

async function rowsOf(body: Buffer, sheet = 0): Promise<unknown[][]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(body as unknown as ArrayBuffer);
  const rows: unknown[][] = [];
  book.worksheets[sheet]?.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1));
  });
  return rows;
}

const PROJECT: TemplateFieldRecord = {
  key: 'project',
  label: { en: 'Project', ar: 'المشروع' },
  type: 'text',
  required: false,
  core: false,
  allowedValues: [],
  palmHrField: 'project_code',
};

function extractRow(
  overrides: Partial<ExtractRow['record']> = {},
  status = 'accepted',
): ExtractRow {
  const record = snapshotRecord(overrides);
  return {
    record: { ...record, upload: { ...record.upload, status } },
    uploadedByName: 'Alpha HR',
    uploadedAt: new Date('2026-10-05T06:00:00Z'),
    fileName: 'employees.csv',
  };
}

describe('labelOf / fieldValue', () => {
  it('uses the Arabic label when there is one', () => {
    expect(labelOf(PROJECT, 'ar')).toBe('المشروع');
    expect(labelOf(PROJECT, 'en')).toBe('Project');
    expect(labelOf({ ...PROJECT, label: { en: 'Project' } }, 'ar')).toBe('Project');
  });

  it('reads every core field by key, and added fields from extras', () => {
    const record = snapshot({ dateLeft: '2026-09-30', extra: { project: 'P1' } });
    expect(TEMPLATE_FIELDS.map((field) => fieldValue(record, field.key))).toEqual([
      'EMP-1101',
      'Aisha Rahman',
      'Finance',
      'Analyst',
      'G5',
      '14200.00',
      '9000.00',
      'AED',
      '2020-01-15',
      '1990-05-01',
      'female',
      'AE',
      'active',
      '2026-09-30',
      'CC-10',
    ]);
    expect(fieldValue(record, 'project')).toBe('P1');
    expect(fieldValue(record, 'missing')).toBeNull();
  });
});

describe('templateWorkbook [R2-01]', () => {
  it('has the header row to fill in and a sheet describing each field', async () => {
    const body = await templateWorkbook(
      { ...TEMPLATE, fields: [...TEMPLATE.fields, { ...PROJECT, label: { en: '=cmd' } }] },
      en,
      'en',
    );
    const [header] = await rowsOf(body, 0);
    expect(header?.slice(0, 2)).toEqual(['Employee ID', 'Full name']);
    // An admin's label can't become a formula.
    expect(header?.at(-1)).toBe("'=cmd");
    const fields = await rowsOf(body, 1);
    expect(fields[11]).toEqual([
      'Gender',
      'gender',
      'One of the allowed values',
      'Yes',
      'female, male',
      '',
    ]);
    expect(fields.at(-1)?.[0]).toContain('Template version 1');
    expect(fields.at(-2)).toEqual(["'=cmd", 'project', 'Text', 'No', '', 'project_code']);
  });

  it('uses Arabic labels for an Arabic reader', async () => {
    const body = await templateWorkbook(
      { ...TEMPLATE, fields: [PROJECT] },
      apiTranslator('ar'),
      'ar',
    );
    expect((await rowsOf(body, 0))[0]).toEqual(['المشروع']);
  });
});

describe('issuesWorkbook [R2-01]', () => {
  it('lists each problem by row and column, in words', async () => {
    const body = await issuesWorkbook(
      uploadRecord({
        status: 'rejected',
        issues: [
          { row: null, field: 'department', code: 'missing_column', severity: 'error' },
          { row: 1, field: null, code: 'unknown_column', severity: 'warning' },
          { row: 7, field: 'grade', code: 'required', severity: 'error' },
          { row: 8, field: 'retired_field', code: 'too_long', severity: 'error' },
        ],
      }),
      TEMPLATE_FIELDS,
      en,
      'en',
    );
    expect(await rowsOf(body)).toEqual([
      ['Row', 'Column', 'Severity', 'Problem'],
      ['Whole file', 'Department', 'Error', 'A required column is missing.'],
      ['Header', '', 'Warning', "This column isn't in the template and was ignored."],
      [7, 'Grade', 'Error', 'A value is required.'],
      [8, 'retired_field', 'Error', 'The text is too long.'],
    ]);
  });
});

describe('raw extract [R2-08, R2-14, RP-08]', () => {
  const options = {
    fields: [...TEMPLATE_FIELDS, PROJECT],
    compensation: true,
    t: en,
    locale: 'en' as const,
  };

  it('gives each row its source: subsidiary, month, upload, version, uploader, file', async () => {
    const rows = await rowsOf(
      await extractWorkbook(
        [
          extractRow({ extra: { project: '=1+1' } }),
          extractRow({ id: 'x' }, 'superseded'),
          extractRow({ id: 'y' }, 'rejected'),
        ],
        options,
      ),
    );
    expect(rows[0]?.slice(0, 10)).toEqual([
      'Subsidiary',
      'Month',
      'Upload',
      'Version',
      'Version status',
      'Uploaded by',
      'Uploaded at',
      'File',
      'Row in file',
      'Employee ID',
    ]);
    expect(rows[1]?.slice(0, 9)).toEqual([
      'SUB-A',
      '2026-09',
      'UP-0001',
      1,
      'In use',
      'Alpha HR',
      '05 Oct 2026, 10:00',
      'employees.csv',
      2,
    ]);
    expect(rows[1]?.at(-1)).toBe("'=1+1");
    expect(rows.slice(2).map((row) => row[4])).toEqual(['Replaced', 'Rejected']);
  });

  it('writes UTF-8 CSV with a BOM, quoting and neutralised text, pay hidden without access', () => {
    const body = extractCsv(
      [extractRow({ fullName: 'Rahman, "Aisha"', extra: { project: '@x' } })],
      {
        ...options,
        compensation: false,
      },
    );
    const text = body.toString('utf8');
    expect(text.startsWith('﻿Subsidiary,Month,')).toBe(true);
    expect(text).toContain('"Rahman, ""Aisha"""');
    expect(text).toContain("'@x");
    expect(text).not.toContain('14200.00');
    expect(text.endsWith('\r\n')).toBe(true);
  });

  it('heads the Palm HR extract with mapped field names, the key until mapped', () => {
    const text = palmHrCsv(
      [extractRow({ extra: { project: 'P1' }, fullName: 'عائشة' })],
      options,
    ).toString('utf8');
    const [header, row] = text.replace('﻿', '').split('\r\n');
    expect(header?.split(',').slice(0, 2)).toEqual(['employee_number', 'full_name']);
    expect(header?.split(',').at(-1)).toBe('project_code');
    expect(row?.split(',').slice(0, 2)).toEqual(['EMP-1101', 'عائشة']);
    expect(row).toContain('14200.00');
  });
});
