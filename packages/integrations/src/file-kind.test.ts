import { describe, expect, it } from 'vitest';
import { detectMediaType, safeFileName } from './file-kind.js';

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('detectMediaType', () => {
  it('recognises files by their content', async () => {
    await expect(detectMediaType(PDF)).resolves.toBe('application/pdf');
    await expect(detectMediaType(PNG)).resolves.toBe('image/png');
  });

  it('ignores what the content merely claims to be', async () => {
    await expect(detectMediaType(Buffer.from('<html><script>alert(1)</script>'))).resolves.toBe(
      null,
    );
    await expect(detectMediaType(Buffer.alloc(0))).resolves.toBe(null);
  });
});

describe('safeFileName', () => {
  it('keeps ordinary and Arabic names, NFC-normalised', () => {
    expect(safeFileName('Appraisal 2026.pdf')).toBe('Appraisal 2026.pdf');
    expect(safeFileName('تقييم الأداء.pdf')).toBe('تقييم الأداء.pdf');
    expect(safeFileName('cafe\u0301.pdf')).toBe('café.pdf');
  });

  it('drops directories from either separator', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\hr\\letter.pdf')).toBe('letter.pdf');
  });

  it('strips control characters and quotes that could break a header', () => {
    expect(safeFileName('a"b\r\nc\u0000.pdf')).toBe('abc.pdf');
  });

  it('caps the length', () => {
    expect(safeFileName(`${'x'.repeat(200)}.pdf`)).toHaveLength(150);
  });

  it('falls back when nothing is left', () => {
    expect(safeFileName('  ')).toBe('evidence');
    expect(safeFileName('folder/', 'file')).toBe('file');
  });
});
