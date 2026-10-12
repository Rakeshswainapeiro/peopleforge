import { z } from 'zod';

/**
 * Locales the codebase is built for. English is the only language at Phase 1 go-live; Arabic
 * is scaffolded so it can be enabled as configuration later (internal standard, not a BRD
 * requirement — see ADR-001).
 */
export const SUPPORTED_LOCALES = ['en', 'ar'] as const;

export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export const DEFAULT_LOCALE: Locale = 'en';

export type TextDirection = 'ltr' | 'rtl';

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

export function directionFor(locale: Locale): TextDirection {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

/** Resolves untrusted input (cookie, header, query) to a supported locale, never throwing. */
export function resolveLocale(candidate: unknown): Locale {
  const parsed = LocaleSchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_LOCALE;
}
