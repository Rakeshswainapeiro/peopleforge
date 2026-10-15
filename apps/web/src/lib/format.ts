import { BUSINESS_TIME_ZONE } from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';

/**
 * Display formatting from the exact decimal strings the API returns. Intl formats the string
 * itself (no conversion to a JS number), so a value is never altered by floating point.
 */
type Decimal = `${number}`;

function asDecimal(value: string): Decimal {
  return value as Decimal;
}

/** "21500.00" → "AED 21,500"; cents are shown only when there are some ("AED 1,226.40"). */
export function formatMoney(value: string, currency: string, locale: Locale): string {
  const hasCents = /\.\d*[1-9]/u.test(value);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(asDecimal(value));
}

/** "8.00" → "8%", "7.30" → "7.3%". */
export function formatPercent(value: string, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'percent',
    maximumFractionDigits: 2,
  }).format(asDecimal(value));
}

/** An input's starting text: "8.00" → "8", "7.30" → "7.3", "1720.50" → "1720.5". */
export function trimDecimal(value: string): string {
  return value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value;
}

/** File sizes by the locale's units: "2 KB", "1.5 MB" (1 KB = 1,024 bytes, as file managers show). */
export function formatFileSize(bytes: number, locale: Locale): string {
  const kb = bytes / 1024;
  const [unit, amount] =
    kb < 1024 ? (['kilobyte', Math.max(kb, 1)] as const) : (['megabyte', kb / 1024] as const);
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    maximumFractionDigits: amount < 10 ? 1 : 0,
  }).format(amount);
}

/** English dates in the UAE read day first ("14 Oct 2026", Figma), as in British English. */
function dateLocale(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : locale;
}

/** A date as Sirius HR reads it: "14 Oct 2026", in the business time zone (Asia/Dubai). */
export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(iso));
}

/** "06 Oct 2026, 16:05" in the business time zone. */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(iso));
}
