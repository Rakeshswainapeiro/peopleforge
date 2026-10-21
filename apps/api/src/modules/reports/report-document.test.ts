import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  documentPdf,
  documentWorkbook,
  number,
  text,
  type ReportDocument,
} from './report-document.js';

// One report model, two renderers (R2-06, R2-07, NFR-INT-01): Excel with numbers that sum and
// text that can't run as a formula; PDF that pages its tables.

function report(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    code: 'RP-99',
    title: 'Test report',
    period: 'September 2026',
    meta: ['Generated 21 Oct 2026 by Reviewer', 'Filters: none'],
    sections: [
      {
        kind: 'figures',
        title: 'Key figures',
        items: [
          { label: 'Headcount', value: '20', hint: '18 the period before' },
          { label: 'Joiners', value: '3' },
          { label: 'Leavers', value: '1' },
          { label: 'Female share', value: '45%' },
        ],
      },
      {
        kind: 'table',
        title: 'By department',
        sheet: 'Departments',
        columns: [
          { header: 'Department', weight: 2 },
          { header: 'Headcount', weight: 1, numeric: true },
          { header: 'Payroll', weight: 1, numeric: true, numFmt: '#,##0.00' },
        ],
        rows: [
          [text('=HYPERLINK("x")'), number(12, '12'), number(1500.5, 'AED 1,500.50')],
          [text('عائشة'), number(null, '—')],
        ],
        empty: '—',
      },
      {
        kind: 'table',
        title: 'Nothing here',
        sheet: 'Empty',
        columns: [],
        rows: [],
        empty: 'None.',
      },
    ],
    footnote: 'Totals only.',
    summary: 'Summary',
    page: (page, pages) => `Page ${String(page)} of ${String(pages)}`,
    landscape: false,
    ...overrides,
  };
}

async function load(body: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body as unknown as ArrayBuffer);
  return workbook;
}

describe('documentWorkbook', () => {
  it('writes a Summary with the figures, then one sheet per table', async () => {
    const workbook = await load(await documentWorkbook(report()));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Summary',
      'Departments',
      'Empty',
    ]);
    const summary = workbook.getWorksheet('Summary');
    expect(summary?.getCell('A1').value).toBe('RP-99 · Test report');
    expect(summary?.getCell('A2').value).toBe('September 2026');
    expect(summary?.getCell('A3').value).toBe('Generated 21 Oct 2026 by Reviewer');
    expect(summary?.getRow(7).values).toEqual([
      undefined,
      'Headcount',
      '20',
      '18 the period before',
    ]);
    expect(summary?.getRow(8).values).toEqual([undefined, 'Joiners', '3', '']);
    expect(summary?.getCell('A12').value).toBe('Totals only.');
  });

  it('keeps numbers as numbers, neutralises formulas, and leaves no value empty', async () => {
    const workbook = await load(await documentWorkbook(report()));
    const departments = workbook.getWorksheet('Departments');
    expect(departments?.getRow(1).values).toEqual([
      undefined,
      'Department',
      'Headcount',
      'Payroll',
    ]);
    expect(departments?.getRow(2).values).toEqual([undefined, '\'=HYPERLINK("x")', 12, 1500.5]);
    expect(departments?.getCell('B3').value).toBeNull();
    expect(departments?.getCell('A3').value).toBe('عائشة');
    expect(departments?.getColumn(3).numFmt).toBe('#,##0.00');
  });
});

describe('documentPdf', () => {
  const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/gu) ?? []).length;

  it('builds an A4 PDF, portrait or landscape', async () => {
    const portrait = await documentPdf(report());
    expect(portrait.subarray(0, 5).toString()).toBe('%PDF-');
    expect(portrait.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
    const landscape = await documentPdf(report({ landscape: true }));
    expect(landscape.toString('latin1')).toContain('/MediaBox [0 0 841.89 595.28]');
  });

  it('continues long tables and many figures over pages', async () => {
    const many = report({
      sections: [
        {
          kind: 'figures',
          title: 'Lots of figures',
          items: Array.from({ length: 40 }, (_, index) => ({
            label: `Figure ${String(index)}`,
            value: String(index),
          })),
        },
        {
          kind: 'table',
          title: 'Long table',
          sheet: 'Long',
          columns: [
            { header: 'Name', weight: 2 },
            { header: 'Count', weight: 1, numeric: true },
          ],
          rows: Array.from({ length: 120 }, (_, index) => [
            text(`Row ${String(index)}`),
            number(index, String(index)),
          ]),
          empty: '—',
        },
      ],
    });
    expect(pages(await documentPdf(many))).toBeGreaterThan(3);
  });
});
