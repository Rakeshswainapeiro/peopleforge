import Link from 'next/link';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';

export default async function NotFound() {
  const t = createTranslator(await getRequestLocale());
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t('states.notFoundTitle')}</h1>
      <p className="mt-3 text-slate-700">{t('states.notFoundBody')}</p>
      <Link href="/" className="mt-6 inline-block text-sky-800 underline">
        {t('states.backHome')}
      </Link>
    </main>
  );
}
