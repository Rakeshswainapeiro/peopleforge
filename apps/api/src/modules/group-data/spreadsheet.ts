import { MAX_UPLOAD_ROWS } from '@peopleforge/contracts';
import ExcelJS from 'exceljs';

/**
 * Reading subsidiary uploads (R2-01) defensively (project rule "spreadsheet handling"): the
 * zip container is inspected before Excel opens it (size, entry count, compression ratio,
 * macros), formulas are refused rather than evaluated, only the first sheet is read, and rows
 * are capped. CSV is strict UTF-8 text. Values come out as text, numbers or dates; the
 * template decides what they must be.
 */

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_TYPE = 'text/csv';

export type CellValue = string | number | Date | null;

export interface SheetRow {
  /** The spreadsheet row number (header = 1). */
  rowNumber: number;
  cells: CellValue[];
}

export type Sheet =
  | {
      ok: true;
      headers: string[];
      rows: SheetRow[];
      formulaCells: { row: number; column: number }[];
    }
  | { ok: false; reason: 'unreadable' | 'macros' | 'too_large' | 'too_many_rows' | 'empty' };

/** Limits on what a 5 MB workbook may expand to. */
const MAX_UNCOMPRESSED = 60 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_RATIO = 200;

type ZipCheck = { ok: true } | { ok: false; reason: 'unreadable' | 'macros' | 'too_large' };

/**
 * Reads the zip central directory (no decompression): refuses archives that would expand past
 * the limits (zip bombs) and workbooks carrying VBA macros. Declared sizes are what the
 * decompressor is then bounded by.
 */
export function inspectZip(body: Buffer): ZipCheck {
  // End of central directory: 22 bytes plus an optional comment of up to 65,535 bytes.
  const searchFrom = Math.max(0, body.length - 22 - 65_535);
  let end = -1;
  for (let at = body.length - 22; at >= searchFrom; at -= 1) {
    if (body.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) return { ok: false, reason: 'unreadable' };
  const entries = body.readUInt16LE(end + 10);
  let offset = body.readUInt32LE(end + 16);
  if (entries > MAX_ENTRIES) return { ok: false, reason: 'too_large' };
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > body.length || body.readUInt32LE(offset) !== 0x02014b50) {
      return { ok: false, reason: 'unreadable' };
    }
    const compressed = body.readUInt32LE(offset + 20);
    const uncompressed = body.readUInt32LE(offset + 24);
    const nameLength = body.readUInt16LE(offset + 28);
    const extraLength = body.readUInt16LE(offset + 30);
    const commentLength = body.readUInt16LE(offset + 32);
    const name = body.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (/vbaProject\.bin$/iu.test(name)) return { ok: false, reason: 'macros' };
    total += uncompressed;
    if (total > MAX_UNCOMPRESSED || uncompressed > Math.max(compressed, 1) * MAX_RATIO) {
      return { ok: false, reason: 'too_large' };
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { ok: true };
}

/** A cell as a plain value; formulas are reported, never evaluated. */
function cellValue(cell: ExcelJS.Cell): { value: CellValue; formula: boolean } {
  const raw = cell.value;
  if (raw === null || raw === undefined) return { value: null, formula: false };
  if (typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date) {
    return { value: raw, formula: false };
  }
  if (typeof raw === 'boolean') return { value: String(raw), formula: false };
  if ('formula' in raw || 'sharedFormula' in raw) return { value: null, formula: true };
  if ('richText' in raw) {
    return { value: raw.richText.map((part) => part.text).join(''), formula: false };
  }
  if ('hyperlink' in raw) return { value: raw.text, formula: false };
  // Errors (#N/A): an empty cell, which the template then judges.
  return { value: null, formula: false };
}

const isBlank = (cells: readonly CellValue[]) =>
  cells.every((cell) => cell === null || (typeof cell === 'string' && cell.trim() === ''));

export async function readXlsx(body: Buffer): Promise<Sheet> {
  const zip = inspectZip(body);
  if (!zip.ok) return { ok: false, reason: zip.reason };
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const [sheet] = workbook.worksheets;
  if (sheet === undefined || sheet.actualRowCount === 0) return { ok: false, reason: 'empty' };
  if (sheet.rowCount > MAX_UPLOAD_ROWS + 1) return { ok: false, reason: 'too_many_rows' };
  const header = sheet.getRow(1);
  const width = header.cellCount;
  const headers: string[] = [];
  for (let column = 1; column <= width; column += 1) {
    const { value } = cellValue(header.getCell(column));
    headers.push(value instanceof Date ? value.toISOString() : String(value ?? '').trim());
  }
  const rows: SheetRow[] = [];
  const formulaCells: { row: number; column: number }[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: CellValue[] = [];
    for (let column = 1; column <= width; column += 1) {
      const { value, formula } = cellValue(row.getCell(column));
      if (formula) formulaCells.push({ row: rowNumber, column });
      cells.push(value);
    }
    if (!isBlank(cells) || formulaCells.some((cell) => cell.row === rowNumber)) {
      rows.push({ rowNumber, cells });
    }
  }
  return { ok: true, headers, rows, formulaCells };
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF; a BOM is ignored. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  // Semicolons when the header has them and no commas (European Excel exports).
  const firstLine = text.slice(0, text.search(/\r?\n|$/u));
  const delimiter = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"' && text.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(index + 1) === '\n') index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function readCsv(body: Buffer): Sheet {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (text.includes('\u0000')) return { ok: false, reason: 'unreadable' };
  const records = parseCsv(text);
  const [header, ...data] = records;
  if (header === undefined) return { ok: false, reason: 'empty' };
  if (data.length > MAX_UPLOAD_ROWS) return { ok: false, reason: 'too_many_rows' };
  const rows = data
    .map((cells, index) => ({
      rowNumber: index + 2,
      cells: cells.map((cell) => (cell.trim() === '' ? null : cell)),
    }))
    .filter((row) => !isBlank(row.cells));
  return { ok: true, headers: header.map((cell) => cell.trim()), rows, formulaCells: [] };
}

/** Excel or CSV by what the content is (magic bytes for Excel; strict UTF-8 text for CSV). */
export async function readSheet(body: Buffer, mediaType: string): Promise<Sheet> {
  return mediaType === XLSX_TYPE ? readXlsx(body) : readCsv(body);
}
