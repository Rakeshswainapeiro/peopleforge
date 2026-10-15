import { DEFAULT_LOCALE, type Locale } from '@sirius/shared-types';

export type TranslationParams = Readonly<Record<string, string | number>>;

/** Flattens nested JSON into dotted keys once at load, so lookups are a single Map read. */
export function flattenMessages(tree: unknown, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  if (typeof tree !== 'object' || tree === null) return result;
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`;
    if (typeof value === 'string') {
      result.set(path, value);
    } else {
      for (const [nestedKey, nestedValue] of flattenMessages(value, `${path}.`)) {
        result.set(nestedKey, nestedValue);
      }
    }
  }
  return result;
}

/**
 * Fills `{name}` placeholders. Values are inserted as text, never read as templates; unknown
 * placeholders stay visible so a missing parameter is caught in review.
 */
export function interpolate(template: string, params: TranslationParams | undefined): string {
  if (params === undefined) return template;
  const values = new Map(Object.entries(params));
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values.get(name);
    return value === undefined ? match : String(value);
  });
}

/**
 * Which message form a count takes: "one" or "other". Messages carry those two forms; the
 * locale's own rules decide (Arabic has more categories, which fall back to "other" until its
 * messages are translated with them).
 */
export function pluralForm(count: number, locale: Locale): 'one' | 'other' {
  return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
}

export interface Catalogues {
  /** A translator for the locale: missing keys fall back to English, then to the key itself. */
  translator: (locale: Locale) => (key: string, params?: TranslationParams) => string;
  /** Keys present in the locale file but absent from English: always a mistake. */
  unknownKeys: (locale: Locale) => string[];
  /** English keys not yet translated in the locale (reported, not enforced, while ar is a scaffold). */
  missingKeys: (locale: Locale) => string[];
}

/**
 * One app's message files (en, ar), flattened once. A partially translated locale never breaks
 * a page or an email: it falls back to English, then to the key.
 */
export function createCatalogues(files: Readonly<Record<Locale, unknown>>): Catalogues {
  const flat = new Map(
    Object.entries(files).map(([locale, tree]) => [locale, flattenMessages(tree)] as const),
  );
  const catalogueFor = (locale: Locale): ReadonlyMap<string, string> =>
    flat.get(locale) ?? new Map<string, string>();
  const english = catalogueFor(DEFAULT_LOCALE);
  return {
    translator: (locale) => {
      const primary = catalogueFor(locale);
      return (key, params) => interpolate(primary.get(key) ?? english.get(key) ?? key, params);
    },
    unknownKeys: (locale) => [...catalogueFor(locale).keys()].filter((key) => !english.has(key)),
    missingKeys: (locale) => {
      const catalogue = catalogueFor(locale);
      return [...english.keys()].filter((key) => !catalogue.has(key));
    },
  };
}
