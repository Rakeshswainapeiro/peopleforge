import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  CSV_TYPE,
  inspectZip,
  parseCsv,
  readCsv,
  readSheet,
  readXlsx,
  XLSX_TYPE,
} from './spreadsheet.js';

// Defensive reading of subsidiary uploads (R2-01; project rule "spreadsheet handling"): zip
// bombs and macros refused before Excel opens a file, formulas reported and never evaluated,
// rows capped, CSV strict UTF-8.

async function workbook(build: (book: ExcelJS.Workbook) => void): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  build(book);
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** A zip holding only a central directory with these entries (all inspectZip reads). */
function centralDirectory(
  entries: { name: string; compressed: number; uncompressed: number }[],
  options: { declared?: number; signature?: number } = {},
): Buffer {
  const records = entries.map((entry) => {
    const name = Buffer.from(entry.name, 'utf8');
    const record = Buffer.alloc(46);
    record.writeUInt32LE(options.signature ?? 0x02014b50, 0);
    record.writeUInt32LE(entry.compressed, 20);
    record.writeUInt32LE(entry.uncompressed, 24);
    record.writeUInt16LE(name.length, 28);
    return Buffer.concat([record, name]);
  });
  const directory = Buffer.concat(records);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(options.declared ?? entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(0, 16);
  return Buffer.concat([directory, end]);
}

describe('inspectZip', () => {
  it('accepts a normal workbook', async () => {
    const body = await workbook((book) => book.addWorksheet('Data').addRow(['a']));
    expect(inspectZip(body)).toEqual({ ok: true });
  });

  it('refuses what is not a zip, broken directories and macros', () => {
    expect(inspectZip(Buffer.alloc(40))).toEqual({ ok: false, reason: 'unreadable' });
    expect(
      inspectZip(
        centralDirectory([{ name: 'a', compressed: 1, uncompressed: 1 }], { signature: 1 }),
      ),
    ).toEqual({ ok: false, reason: 'unreadable' });
    // Declares more entries than it holds: the next record runs past the end.
    expect(
      inspectZip(
        centralDirectory([{ name: 'a', compressed: 1, uncompressed: 1 }], { declared: 2 }),
      ),
    ).toEqual({ ok: false, reason: 'unreadable' });
    expect(
      inspectZip(
        centralDirectory([{ name: 'xl/vbaProject.bin', compressed: 10, uncompressed: 10 }]),
      ),
    ).toEqual({ ok: false, reason: 'macros' });
  });

  it('refuses zip bombs: too many entries, too large, or compressed too far', () => {
    expect(inspectZip(centralDirectory([], { declared: 2001 }))).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(
      inspectZip(
        centralDirectory([
          { name: 'a', compressed: 1_000_000, uncompressed: 40_000_000 },
          { name: 'b', compressed: 1_000_000, uncompressed: 40_000_000 },
        ]),
      ),
    ).toEqual({ ok: false, reason: 'too_large' });
    expect(
      inspectZip(centralDirectory([{ name: 'a', compressed: 10, uncompressed: 2001 }])),
    ).toEqual({
      ok: false,
      reason: 'too_large',
    });
    // Empty entries (0 → 0) are fine.
    expect(inspectZip(centralDirectory([{ name: 'a/', compressed: 0, uncompressed: 0 }]))).toEqual({
      ok: true,
    });
  });
});

describe('readXlsx [R2-01]', () => {
  it('reads the first sheet as text, numbers and dates, skipping blank rows', async () => {
    const joined = new Date(Date.UTC(2020, 0, 15));
    const body = await workbook((book) => {
      const sheet = book.addWorksheet('Data');
      sheet.addRow(['Employee ID', ' Full name ', new Date(Date.UTC(2026, 0, 1)), 'Salary']);
      // Values past the last header have no column: ignored.
      sheet.addRow(['EMP-1', 'Aisha', joined, 14200.5, 'stray']);
      sheet.addRow([null, '  ', null, null]);
      sheet.addRow([
        { richText: [{ text: 'Ri' }, { text: 'ch' }] },
        { text: 'Link', hyperlink: 'https://example.invalid' },
        true,
        { error: '#N/A' },
      ]);
      book.addWorksheet('Ignored').addRow(['x']);
    });
    const sheet = await readXlsx(body);
    expect(sheet).toEqual({
      ok: true,
      headers: ['Employee ID', 'Full name', '2026-01-01T00:00:00.000Z', 'Salary'],
      rows: [
        { rowNumber: 2, cells: ['EMP-1', 'Aisha', joined, 14200.5] },
        { rowNumber: 4, cells: ['Rich', 'Link', 'true', null] },
      ],
      formulaCells: [],
    });
  });

  it('keeps a gap in the header as an empty column name', async () => {
    const body = await workbook((book) => {
      const sheet = book.addWorksheet('Data');
      sheet.addRow(['A', null, 'C']);
      sheet.addRow([1, 2, 3]);
    });
    expect(await readXlsx(body)).toMatchObject({ headers: ['A', '', 'C'] });
  });

  it('reports formula cells and never evaluates them', async () => {
    const body = await workbook((book) => {
      const sheet = book.addWorksheet('Data');
      sheet.addRow(['A', 'B']);
      sheet.addRow([{ formula: 'HYPERLINK("http://x","y")', result: 'y' }, 1]);
      sheet.addRow([null, null]);
      sheet.getCell('A3').value = { sharedFormula: 'A2', result: 'y' };
    });
    const sheet = await readXlsx(body);
    expect(sheet).toMatchObject({
      ok: true,
      rows: [
        { rowNumber: 2, cells: [null, 1] },
        { rowNumber: 3, cells: [null, null] },
      ],
      formulaCells: [
        { row: 2, column: 1 },
        { row: 3, column: 1 },
      ],
    });
  });

  it('refuses empty, oversized and unreadable workbooks', async () => {
    expect(await readXlsx(await workbook(() => undefined))).toEqual({ ok: false, reason: 'empty' });
    expect(await readXlsx(await workbook((book) => book.addWorksheet('Data')))).toEqual({
      ok: false,
      reason: 'empty',
    });
    const tooMany = await workbook((book) => {
      const sheet = book.addWorksheet('Data');
      sheet.addRow(['A']);
      sheet.getCell('A10002').value = 'x';
    });
    expect(await readXlsx(tooMany)).toEqual({ ok: false, reason: 'too_many_rows' });
    expect(
      await readXlsx(centralDirectory([{ name: 'a', compressed: 1, uncompressed: 1 }])),
    ).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    expect(
      await readXlsx(
        centralDirectory([{ name: 'xl/vbaProject.bin', compressed: 1, uncompressed: 1 }]),
      ),
    ).toEqual({ ok: false, reason: 'macros' });
  });
});

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, CRLF, CR and a last line without a newline', () => {
    expect(parseCsv('a,"b,1","say ""hi"""\r\nc,d"e,f\rg,h')).toEqual([
      ['a', 'b,1', 'say "hi"'],
      ['c', 'd"e', 'f'],
      ['g', 'h'],
    ]);
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']]);
    expect(parseCsv('a,\n')).toEqual([['a', '']]);
    expect(parseCsv('')).toEqual([]);
  });

  it('uses semicolons when the header has them and no commas', () => {
    expect(parseCsv('a;b\n1,5;2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });
});

describe('readCsv [R2-01]', () => {
  it('reads UTF-8 (BOM ignored), Arabic intact, blanks as empty cells, blank rows skipped', () => {
    const body = Buffer.from('﻿ Employee ID ,Name\nEMP-1,عائشة\n,\nEMP-2, \n', 'utf8');
    expect(readCsv(body)).toEqual({
      ok: true,
      headers: ['Employee ID', 'Name'],
      rows: [
        { rowNumber: 2, cells: ['EMP-1', 'عائشة'] },
        { rowNumber: 4, cells: ['EMP-2', null] },
      ],
      formulaCells: [],
    });
  });

  it('refuses non UTF-8, NUL bytes, empty files and too many rows', () => {
    expect(readCsv(Buffer.from([0x41, 0xff, 0x42]))).toEqual({ ok: false, reason: 'unreadable' });
    expect(readCsv(Buffer.from('a\u0000b'))).toEqual({ ok: false, reason: 'unreadable' });
    expect(readCsv(Buffer.alloc(0))).toEqual({ ok: false, reason: 'empty' });
    expect(readCsv(Buffer.from(`A\n${'x\n'.repeat(10_001)}`))).toEqual({
      ok: false,
      reason: 'too_many_rows',
    });
  });
});

describe('readSheet', () => {
  it('reads by the detected type', async () => {
    const body = await workbook((book) => book.addWorksheet('Data').addRow(['A']));
    expect(await readSheet(body, XLSX_TYPE)).toMatchObject({ ok: true, headers: ['A'] });
    expect(await readSheet(Buffer.from('B\n1'), CSV_TYPE)).toMatchObject({
      ok: true,
      headers: ['B'],
    });
  });
});
