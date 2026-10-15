import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  formatAge,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatMoney,
  formatPercent,
  trimDecimal,
} from './format';

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

describe('formatDate / formatDateTime', () => {
  it('shows the business day in Dubai, not UTC', () => {
    // 22:30 UTC on 13 Oct is already 14 Oct, 02:30 in Dubai.
    expect(formatDate('2026-10-13T22:30:00.000Z', 'en')).toBe('14 Oct 2026');
    expect(formatDateTime('2026-10-13T22:30:00.000Z', 'en')).toBe('14 Oct 2026, 02:30');
  });

  it('formats Arabic in Arabic', () => {
    expect(formatDate('2026-10-14T08:00:00.000Z', 'ar')).not.toContain('Oct');
  });
});

describe('daysBetween / formatAge [R1-10]', () => {
  const now = new Date('2026-10-15T06:00:00Z'); // 10:00 in Dubai

  it('counts calendar days in Dubai, not 24-hour periods', () => {
    expect(daysBetween('2026-10-15T01:00:00Z', now)).toBe(0);
    expect(daysBetween('2026-10-13T06:00:00Z', now)).toBe(2);
    // 21:30 UTC on the 14th is already 01:30 on the 15th in Dubai: same day.
    expect(daysBetween('2026-10-14T21:30:00Z', now)).toBe(0);
    // 19:59 UTC on the 14th is 23:59 in Dubai: yesterday.
    expect(daysBetween('2026-10-14T19:59:00Z', now)).toBe(1);
    // Month and year boundaries.
    expect(daysBetween('2025-12-31T10:00:00Z', new Date('2026-01-01T10:00:00Z'))).toBe(1);
    // A clock slightly ahead never gives a negative age.
    expect(daysBetween('2026-10-16T06:00:00Z', now)).toBe(0);
  });

  it('writes the age with the locale’s narrow day unit', () => {
    expect(formatAge('2026-10-13T06:00:00Z', now, 'en')).toBe('2d');
    expect(formatAge('2026-10-13T06:00:00Z', now, 'ar')).toMatch(/٢|2/u);
  });
});
