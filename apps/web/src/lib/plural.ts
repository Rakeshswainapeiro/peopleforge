import type { Locale } from '@sirius/shared-types';

/**
 * Which message form a count takes: "one" or "other". Messages carry those two forms; the
 * locale's own rules decide (Arabic has more categories, which fall back to "other" until its
 * messages are translated with them).
 */
export function pluralForm(count: number, locale: Locale): 'one' | 'other' {
  return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
}
