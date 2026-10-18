import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import { RequestStatusSchema } from '@peopleforge/contracts';
import type { ReportContent } from './report-content.js';
import type { ReportLabels } from './report-labels.js';

/**
 * The status report as a presentation-ready PDF (RP-01): A4 landscape, title, who and when,
 * filters, requests per status, then every request with its TAT; page numbers in the footer.
 * Noto Sans for Latin text and Noto Sans Arabic for Arabic (names, and the Arabic UI later),
 * embedded from the package: nothing is fetched at run time.
 */

const require = createRequire(import.meta.url);
const FONTS = {
  regular: require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),
  bold: require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff'),
  arabic:
    require.resolve('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff'),
};

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFE]/u;

/** The font that has the glyphs: Arabic text in Noto Sans Arabic, everything else Noto Sans. */
export function fontFor(text: string, bold = false): 'arabic' | 'bold' | 'regular' {
  if (ARABIC.test(text)) return 'arabic';
  return bold ? 'bold' : 'regular';
}

const MARGIN = 36;
const ROW = 18;
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

export async function incrementPdf(content: ReportContent, labels: ReportLabels): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: `${labels.code} ${labels.title}`, Author: 'PeopleForge' },
  });
  doc.registerFont('regular', FONTS.regular);
  doc.registerFont('bold', FONTS.bold);
  doc.registerFont('arabic', FONTS.arabic);
  const done = new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });

  const width = doc.page.width - MARGIN * 2;
  const write = (text: string, size: number, options: { bold?: boolean; color?: string } = {}) => {
    doc
      .font(fontFor(text, options.bold))
      .fontSize(size)
      .fillColor(options.color ?? INK)
      .text(text, { width });
  };

  write(`${labels.code} · ${labels.title}`, 16, { bold: true });
  doc.moveDown(0.3);
  write(labels.generated, 9, { color: MUTED });
  write(labels.filters, 9, { color: MUTED });
  if (labels.truncated !== null) write(labels.truncated, 9, { color: '#a86400' });
  doc.moveDown(0.8);

  // Requests per status, one compact line.
  write(labels.countsTitle, 11, { bold: true });
  write(
    [
      ...Object.entries(content.counts).map(
        ([status, count]) =>
          `${labels.status(RequestStatusSchema.parse(status))}: ${String(count)}`,
      ),
      `${labels.countsTotal}: ${String(content.requests.length)}`,
    ].join('   ·   '),
    9,
  );
  doc.moveDown(0.8);

  type Request = ReportContent['requests'][number];
  const columns: readonly { title: string; width: number; value: (row: Request) => string }[] = [
    { title: labels.columns.request, width: 0.13, value: (row) => row.reference },
    { title: labels.columns.subsidiary, width: 0.09, value: (row) => row.entityCode },
    { title: labels.columns.status, width: 0.13, value: (row) => labels.status(row.status) },
    { title: labels.columns.employees, width: 0.08, value: (row) => String(row.employees) },
    { title: labels.columns.approved, width: 0.08, value: (row) => String(row.byStatus.approved) },
    { title: labels.columns.rejected, width: 0.08, value: (row) => String(row.byStatus.rejected) },
    { title: labels.columns.returned, width: 0.08, value: (row) => String(row.byStatus.returned) },
    {
      title: labels.columns.submitted,
      width: 0.13,
      value: (row) => labels.dateTime(row.submittedAt),
    },
    { title: labels.columns.decided, width: 0.13, value: (row) => labels.dateTime(row.decidedAt) },
    {
      title: labels.columns.tat,
      width: 0.07,
      value: (row) => (row.tatDays === null ? labels.none : String(row.tatDays)),
    },
  ];
  const cell = (text: string, x: number, y: number, w: number, bold: boolean) => {
    doc
      .font(fontFor(text, bold))
      .fontSize(8)
      .fillColor(INK)
      .text(text, x + 3, y + 5, {
        width: w - 6,
        height: ROW - 4,
        ellipsis: true,
        lineBreak: false,
      });
  };
  /** One table row: the header (`null`) or a request, starting a new page when full. */
  const row = (request: Request | null) => {
    if (doc.y + ROW > doc.page.height - MARGIN - 20) {
      doc.addPage();
      row(null);
    }
    const y = doc.y;
    let x = MARGIN;
    for (const column of columns) {
      const w = width * column.width;
      cell(request === null ? column.title : column.value(request), x, y, w, request === null);
      x += w;
    }
    doc
      .moveTo(MARGIN, y + ROW)
      .lineTo(MARGIN + width, y + ROW)
      .strokeColor(LINE)
      .lineWidth(0.5)
      .stroke();
    doc.x = MARGIN;
    doc.y = y + ROW;
  };

  if (content.requests.length === 0) {
    write(labels.empty, 10, { color: MUTED });
  } else {
    row(null);
    for (const request of content.requests) row(request);
  }
  doc.moveDown(1);
  write(labels.tatNote, 8, { color: MUTED });

  // Footer on every page: "Page n of m".
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const footer = labels.page(index + 1, range.count);
    doc
      .font(fontFor(footer))
      .fontSize(8)
      .fillColor(MUTED)
      .text(footer, MARGIN, doc.page.height - MARGIN - 4, {
        width,
        align: 'right',
        lineBreak: false,
      });
  }
  doc.end();
  return done;
}
