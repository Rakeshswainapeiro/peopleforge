import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';

export default async function Loading() {
  const t = createTranslator(await getRequestLocale());
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-5xl px-4 py-10 text-slate-600">
      {t('states.loading')}
    </div>
  );
}
