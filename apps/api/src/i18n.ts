import { createCatalogues, type TranslationParams } from '@peopleforge/i18n';
import type { Locale } from '@sirius/shared-types';
import ar from './messages/ar.json' with { type: 'json' };
import en from './messages/en.json' with { type: 'json' };

/**
 * The API's own wording, for files it builds (reports, R1-14): English with an Arabic scaffold,
 * falling back to English, like the web app and the worker (shared `@peopleforge/i18n`).
 */
const catalogues = createCatalogues({ en, ar });

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type ApiMessageKey = Leaves<typeof en>;
export type ApiTranslate = (key: ApiMessageKey, params?: TranslationParams) => string;

export function apiTranslator(locale: Locale): ApiTranslate {
  return catalogues.translator(locale);
}

/** Message-file integrity, checked by the tests. */
export const unknownApiKeys = (locale: Locale): string[] => catalogues.unknownKeys(locale);
