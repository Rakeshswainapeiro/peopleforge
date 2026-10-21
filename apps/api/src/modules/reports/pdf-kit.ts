import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

/**
 * What every PeopleForge PDF shares (RP-01 … RP-07): A4, the embedded Noto fonts (Latin and
 * Arabic, nothing fetched at run time), colours, and a document that resolves to its bytes.
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

export const MARGIN = 36;
export const INK = '#111827';
export const MUTED = '#6b7280';
export const LINE = '#e5e7eb';
export const FILL = '#f3f4f6';

/** A new A4 document with the fonts registered; `done` resolves to the file once `end()`ed. */
export function newPdf(options: { title: string; landscape: boolean }): {
  doc: PDFKit.PDFDocument;
  done: Promise<Buffer>;
} {
  const doc = new PDFDocument({
    size: 'A4',
    layout: options.landscape ? 'landscape' : 'portrait',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: options.title, Author: 'PeopleForge' },
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
  return { doc, done };
}

/** "Page n of m" in the footer of every page, then the end of the document. */
export function finish(
  doc: PDFKit.PDFDocument,
  page: (page: number, pages: number) => string,
): void {
  const width = doc.page.width - MARGIN * 2;
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const footer = page(index + 1, range.count);
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
}
