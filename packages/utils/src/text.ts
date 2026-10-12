/**
 * Canonical form for free text and names before validation or storage. NFC keeps visually
 * identical Arabic and Latin strings byte-identical, so duplicate detection, search and the
 * prior-period comparison (R2-09) don't report false differences.
 */
export function normaliseText(value: string): string {
  return value.normalize('NFC').trim();
}
