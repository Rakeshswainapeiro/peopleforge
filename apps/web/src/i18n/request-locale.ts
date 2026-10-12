import { cookies } from 'next/headers';
import { resolveLocale, type Locale } from '@sirius/shared-types';

export const LOCALE_COOKIE = 'locale';

/** The viewer's chosen locale from the preference cookie; untrusted, so always validated. */
export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}
