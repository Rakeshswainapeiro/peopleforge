import ExcelJS from 'exceljs';
import { RequestStatusSchema } from '@peopleforge/contracts';
import { neutraliseFormula } from '@sirius/utils';
import type { ReportContent } from './report-content.js';
import type { ReportLabels } from './report-labels.js';

/**
 * Formula injection (OWASP): a text cell starting with `=`, `+`, `-`, `@`, tab or CR could run
 * as a formula when the file is opened or re-saved as CSV. Such text gets a leading apostrophe,
 * which Excel shows as text. Every text cell goes through here: the platform's shared guard.
 */
export function safeText(value: string): string {
  return neutraliseFormula(value);
}

/** A decimal string as a number cell (Excel sums and sorts it); none stays empty. */
function amount(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function sheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: readonly { header: string; width: number; numFmt?: string }[],
  rows: readonly (readonly (string | number | null)[])[],
): void {
  const worksheet = workbook.addWorksheet(safeText(name), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  worksheet.columns = columns.map((column) => ({
    header: safeText(column.header),
    width: column.width,
    ...(column.numFmt === undefined ? {} : { style: { numFmt: column.numFmt } }),
  }));
  worksheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    worksheet.addRow(row.map((cell) => (typeof cell === 'string' ? safeText(cell) : cell)));
  }
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

const PERCENT = '0.00';
const MONEY = '#,##0.00';

/**
 * The status report as an Excel workbook (RP-01): Summary (who, when, filters, requests per
 * status), Requests and Employees sheets with filters and a frozen header. Opens in MS Office
 * (NFR-INT-01); text in UTF-8, so Arabic names show as they are.
 */
export async function incrementWorkbook(
  content: ReportContent,
  labels: ReportLabels,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeopleForge';
  const columns = labels.columns;

  const summary = workbook.addWorksheet(safeText(labels.sheets.summary));
  summary.columns = [{ width: 36 }, { width: 14 }];
  const lines: (readonly [string, number | string | null])[] = [
    [`${labels.code} · ${labels.title}`, null],
    [labels.generated, null],
    [labels.filters, null],
    ...(labels.truncated === null ? [] : [[labels.truncated, null] as const]),
    ['', null],
    [labels.countsTitle, null],
    ...Object.entries(content.counts).map(
      ([status, count]) => [labels.status(RequestStatusSchema.parse(status)), count] as const,
    ),
    [labels.countsTotal, content.requests.length],
    ['', null],
    [labels.tatNote, null],
    [labels.increaseNote, null],
  ];
  for (const [text, value] of lines) summary.addRow([safeText(text), value]);
  summary.getRow(1).font = { bold: true, size: 14 };

  sheet(
    workbook,
    labels.sheets.requests,
    [
      { header: columns.request, width: 16 },
      { header: columns.subsidiary, width: 12 },
      { header: columns.status, width: 16 },
      { header: columns.employees, width: 11 },
      { header: columns.approved, width: 10 },
      { header: columns.rejected, width: 10 },
      { header: columns.returned, width: 10 },
      { header: columns.pending, width: 14 },
      { header: columns.submitted, width: 20 },
      { header: columns.decided, width: 20 },
      { header: columns.tat, width: 10 },
    ],
    content.requests.map((row) => [
      row.reference,
      row.entityCode,
      labels.status(row.status),
      row.employees,
      row.byStatus.approved,
      row.byStatus.rejected,
      row.byStatus.returned,
      row.byStatus.pending,
      labels.dateTime(row.submittedAt),
      labels.dateTime(row.decidedAt),
      row.tatDays,
    ]),
  );

  sheet(
    workbook,
    labels.sheets.employees,
    [
      { header: columns.request, width: 16 },
      { header: columns.subsidiary, width: 12 },
      { header: columns.employeeId, width: 13 },
      { header: columns.employee, width: 26 },
      { header: columns.grade, width: 8 },
      { header: columns.employeeStatus, width: 16 },
      { header: columns.proposed, width: 11, numFmt: PERCENT },
      { header: columns.approvedPercent, width: 12, numFmt: PERCENT },
      { header: columns.currency, width: 9 },
      { header: columns.increase, width: 16, numFmt: MONEY },
      { header: columns.status, width: 16 },
      { header: columns.submitted, width: 20 },
      { header: columns.decided, width: 20 },
      { header: columns.tat, width: 10 },
    ],
    content.employees.map((row) => [
      row.reference,
      row.entityCode,
      row.employeeNumber,
      row.fullName,
      row.grade,
      labels.lineStatus(row.reviewStatus),
      amount(row.proposedPercent),
      amount(row.approvedPercent),
      row.currency,
      amount(row.increase),
      labels.status(row.requestStatus),
      labels.dateTime(row.submittedAt),
      labels.dateTime(row.decidedAt),
      row.tatDays,
    ]),
  );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
