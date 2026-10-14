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
