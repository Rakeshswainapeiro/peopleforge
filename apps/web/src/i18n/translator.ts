import { DEFAULT_LOCALE, type Locale } from '@sirius-hr/shared-types';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid translation key, derived from the English source file. */
export type MessageKey = Leaves<typeof en>;

export type TranslationParams = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, params?: TranslationParams) => string;

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

const EN = flattenMessages(en);
const AR = flattenMessages(ar);

function catalogueFor(locale: Locale): ReadonlyMap<string, string> {
  switch (locale) {
    case 'en':
      return EN;
    case 'ar':
      return AR;
  }
}

function interpolate(template: string, params: TranslationParams | undefined): string {
  if (params === undefined) return template;
  const values = new Map(Object.entries(params));
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values.get(name);
    return value === undefined ? match : String(value);
  });
}

/**
 * Returns a translator for the locale. Missing keys fall back to English, then to the key
 * itself, so a partially translated locale (Arabic is scaffolded only) never breaks a page.
 */
export function createTranslator(locale: Locale): Translate {
  const primary = catalogueFor(locale);
  const fallback = catalogueFor(DEFAULT_LOCALE);
  return (key, params) => {
    const template = primary.get(key) ?? fallback.get(key) ?? key;
    return interpolate(template, params);
  };
}

/** Keys present in the locale file but absent from English — always a mistake. */
export function unknownKeys(locale: Locale): string[] {
  const english = catalogueFor(DEFAULT_LOCALE);
  return [...catalogueFor(locale).keys()].filter((key) => !english.has(key));
}

/** English keys not yet translated in the locale; reported, not enforced, while ar is a scaffold. */
export function missingKeys(locale: Locale): string[] {
  const catalogue = catalogueFor(locale);
  return [...catalogueFor(DEFAULT_LOCALE).keys()].filter((key) => !catalogue.has(key));
}
