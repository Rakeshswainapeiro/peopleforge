import { describe, expect, it } from 'vitest';
import { formatFileSize, formatMoney, formatPercent, trimDecimal } from './format';

describe('formatMoney', () => {
  it('shows whole amounts without cents and keeps cents when present', () => {
    expect(formatMoney('21500.00', 'AED', 'en')).toMatch(/^AED\s21,500$/u);
    expect(formatMoney('1226.40', 'AED', 'en')).toMatch(/^AED\s1,226\.40$/u);
    expect(formatMoney('21500', 'AED', 'en')).toMatch(/^AED\s21,500$/u);
  });

  it('never rounds through floating point', () => {
    expect(formatMoney('999999999.99', 'AED', 'en')).toMatch(/999,999,999\.99$/u);
  });

  it('formats for Arabic too', () => {
    expect(formatMoney('21500.00', 'AED', 'ar')).toContain('AED');
  });
});

describe('formatPercent', () => {
  it('drops trailing zeros', () => {
    expect(formatPercent('8.00', 'en')).toBe('8%');
    expect(formatPercent('7.30', 'en')).toBe('7.3%');
  });
});

describe('trimDecimal', () => {
  it.each([
    ['8.00', '8'],
    ['7.30', '7.3'],
    ['1720.50', '1720.5'],
    ['1720', '1720'],
    ['100.00', '100'],
  ])('%s → %s', (value, expected) => {
    expect(trimDecimal(value)).toBe(expected);
  });
});

describe('formatFileSize', () => {
  it('uses kilobytes below a megabyte, never showing less than 1', () => {
    expect(formatFileSize(10, 'en')).toBe('1 kB');
    expect(formatFileSize(2048, 'en')).toBe('2 kB');
    expect(formatFileSize(1536, 'en')).toBe('1.5 kB');
    expect(formatFileSize(240 * 1024, 'en')).toBe('240 kB');
  });

  it('uses megabytes above, in the locale’s numerals', () => {
    expect(formatFileSize(1.5 * 1024 * 1024, 'en')).toBe('1.5 MB');
    expect(formatFileSize(10 * 1024 * 1024, 'en')).toBe('10 MB');
    expect(formatFileSize(1024 * 1024, 'ar')).not.toBe('1 MB');
  });
});
