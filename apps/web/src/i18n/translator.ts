import { createCatalogues, type TranslationParams } from '@peopleforge/i18n';
import type { Locale } from '@sirius/shared-types';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid translation key, derived from the English source file. */
export type MessageKey = Leaves<typeof en>;

export type { TranslationParams } from '@peopleforge/i18n';
export type Translate = (key: MessageKey, params?: TranslationParams) => string;

const catalogues = createCatalogues({ en, ar });

/**
 * Returns a translator for the locale. Missing keys fall back to English, then to the key
 * itself, so a partially translated locale (Arabic is scaffolded only) never breaks a page.
 */
export function createTranslator(locale: Locale): Translate {
  return catalogues.translator(locale);
}

/** Keys present in the locale file but absent from English — always a mistake. */
export const unknownKeys = (locale: Locale): string[] => catalogues.unknownKeys(locale);

/** English keys not yet translated in the locale; reported, not enforced, while ar is a scaffold. */
export const missingKeys = (locale: Locale): string[] => catalogues.missingKeys(locale);
