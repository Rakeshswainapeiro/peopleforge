'use server';

import { cookies } from 'next/headers';
import { LocaleSchema } from '@sirius/shared-types';
import { LOCALE_COOKIE } from '@/i18n/request-locale';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Stores the language preference. Server Actions are POST-only and Next.js rejects calls whose
 * Origin doesn't match the host, which covers CSRF for this endpoint. Unsupported values are
 * ignored rather than echoed back.
 */
export async function setLocale(formData: FormData): Promise<void> {
  const parsed = LocaleSchema.safeParse(formData.get('locale'));
  if (!parsed.success) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}
