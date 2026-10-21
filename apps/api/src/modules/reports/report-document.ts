import ExcelJS from 'exceljs';
import { finish, FILL, fontFor, INK, LINE, MARGIN, MUTED, newPdf } from './pdf-kit.js';
import { safeText, sheet } from './xlsx.js';

/**
 * A report as content, apart from its file format (R2-06, R2-07): a title, who and when, then
 * sections of key figures and tables. One model, two renderers, so RP-03 … RP-07 differ only
 * in what they say, never in how Excel or PDF is laid out (NFR-INT-01: opens in MS Office).
 * Every word arrives translated; every text cell is neutralised against formula injection.
 */

/** A table cell: the words people read, and the number Excel sums (none for text). */
export interface Cell {
  text: string;
  value?: number | null;
}

export interface FiguresSection {
  kind: 'figures';
  title: string;
  items: readonly { label: string; value: string; hint?: string }[];
}

export interface TableSection {
  kind: 'table';
  title: string;
  /** Excel sheet name (≤ 31 characters, unique in the workbook). */
  sheet: string;
  /** `weight`: the column's share of the page width; numeric columns align to the end. */
  columns: readonly { header: string; weight: number; numeric?: boolean; numFmt?: string }[];
  rows: readonly (readonly Cell[])[];
  /** Said instead of an empty table. */
  empty: string;
}

export type ReportSection = FiguresSection | TableSection;

export interface ReportDocument {
  code: string;
  title: string;
  /** "September 2026", "Q3 2026", "2026". */
  period: string;
  /** Who and when, filters. */
  meta: readonly string[];
  sections: readonly ReportSection[];
  footnote: string;
  /** Summary sheet name. */
  summary: string;
  page: (page: number, pages: number) => string;
  landscape: boolean;
}

export const text = (value: string): Cell => ({ text: value });
export const number = (value: number | null, shown: string): Cell => ({ text: shown, value });

/** The workbook: Summary (title, who, when, key figures), then one sheet per table. */
export async function documentWorkbook(report: ReportDocument): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeopleForge';
  const summary = workbook.addWorksheet(safeText(report.summary));
  summary.columns = [{ width: 44 }, { width: 22 }, { width: 40 }];
  summary.addRow([safeText(`${report.code} · ${report.title}`)]).font = { bold: true, size: 14 };
  summary.addRow([safeText(report.period)]).font = { bold: true };
  for (const line of report.meta) summary.addRow([safeText(line)]);
  for (const section of report.sections) {
    if (section.kind !== 'figures') continue;
    summary.addRow([]);
    summary.addRow([safeText(section.title)]).font = { bold: true };
    for (const item of section.items) {
      summary.addRow([safeText(item.label), safeText(item.value), safeText(item.hint ?? '')]);
    }
  }
  summary.addRow([]);
  summary.addRow([safeText(report.footnote)]);
  for (const section of report.sections) {
    if (section.kind !== 'table') continue;
    sheet(
      workbook,
      section.sheet,
      section.columns.map((column) => ({
        header: column.header,
        width: Math.max(10, Math.round(column.weight * 80)),
        ...(column.numFmt === undefined ? {} : { numFmt: column.numFmt }),
      })),
      section.rows.map((row) =>
        row.map((cell) => (cell.value === undefined ? cell.text : cell.value)),
      ),
    );
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const ROW = 18;
const TILE = 52;

/** The presentation-ready PDF: A4, figures as tiles, tables that continue across pages. */
export async function documentPdf(report: ReportDocument): Promise<Buffer> {
  const { doc, done } = newPdf({
    title: `${report.code} ${report.title}`,
    landscape: report.landscape,
  });
  const width = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - MARGIN - 24;
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };
  const write = (value: string, size: number, options: { bold?: boolean; color?: string } = {}) => {
    doc
      .font(fontFor(value, options.bold))
      .fontSize(size)
      .fillColor(options.color ?? INK)
      .text(value, MARGIN, doc.y, { width });
  };

  write(`${report.code} · ${report.title}`, 18, { bold: true });
  write(report.period, 12, { bold: true, color: MUTED });
  doc.moveDown(0.3);
  for (const line of report.meta) write(line, 9, { color: MUTED });
  doc.moveDown(0.6);

  for (const section of report.sections) {
    ensure(ROW * 3);
    doc.moveDown(0.6);
    write(section.title, 12, { bold: true });
    doc.moveDown(0.3);
    if (section.kind === 'figures') {
      const perRow = report.landscape ? 4 : 3;
      const tile = (width - (perRow - 1) * 8) / perRow;
      section.items.forEach((item, index) => {
        if (index % perRow === 0) ensure(TILE + 8);
        const x = MARGIN + (index % perRow) * (tile + 8);
        const y = doc.y;
        doc.roundedRect(x, y, tile, TILE, 4).fillAndStroke(FILL, LINE);
        doc
          .font(fontFor(item.label))
          .fontSize(8)
          .fillColor(MUTED)
          .text(item.label, x + 8, y + 7, { width: tile - 16, lineBreak: false, ellipsis: true });
        doc
          .font(fontFor(item.value, true))
          .fontSize(14)
          .fillColor(INK)
          .text(item.value, x + 8, y + 19, { width: tile - 16, lineBreak: false, ellipsis: true });
        if (item.hint !== undefined) {
          doc
            .font(fontFor(item.hint))
            .fontSize(7)
            .fillColor(MUTED)
            .text(item.hint, x + 8, y + 38, {
              width: tile - 16,
              lineBreak: false,
              ellipsis: true,
            });
        }
        doc.y =
          index % perRow === perRow - 1 || index === section.items.length - 1 ? y + TILE + 8 : y;
      });
      continue;
    }
    if (section.rows.length === 0) {
      write(section.empty, 9, { color: MUTED });
      continue;
    }
    const total = section.columns.reduce((sum, column) => sum + column.weight, 0);
    const layout = section.columns.map((column) => ({
      width: (width * column.weight) / total,
      align: column.numeric === true ? ('right' as const) : ('left' as const),
    }));
    const headers = section.columns.map((column) => column.header);
    const row = (cells: readonly string[], header: boolean) => {
      const y = doc.y;
      if (header) doc.rect(MARGIN, y, width, ROW).fill(FILL);
      let x = MARGIN;
      layout.forEach((column, index) => {
        // A row shorter than the columns leaves the rest empty.
        const cell = cells.at(index) ?? '';
        doc
          .font(fontFor(cell, header))
          .fontSize(8)
          .fillColor(INK)
          .text(cell, x + 4, y + 5, {
            width: column.width - 8,
            height: ROW - 4,
            lineBreak: false,
            ellipsis: true,
            align: column.align,
          });
        x += column.width;
      });
      doc
        .moveTo(MARGIN, y + ROW)
        .lineTo(MARGIN + width, y + ROW)
        .strokeColor(LINE)
        .lineWidth(0.5)
        .stroke();
      doc.x = MARGIN;
      doc.y = y + ROW;
    };
    // The header never sits alone at a page foot, and repeats on every page the table runs to.
    ensure(ROW * 2);
    row(headers, true);
    for (const cells of section.rows) {
      if (doc.y + ROW > bottom()) {
        doc.addPage();
        row(headers, true);
      }
      row(
        cells.map((cell) => cell.text),
        false,
      );
    }
  }
  doc.moveDown(1);
  ensure(ROW);
  write(report.footnote, 8, { color: MUTED });
  finish(doc, report.page);
  return done;
}
