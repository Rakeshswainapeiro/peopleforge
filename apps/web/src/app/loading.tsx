import { PageSkeleton } from '@/components/page-skeleton';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';

/** Before the portal shell exists (e.g. straight after sign-in). */
export default async function Loading() {
  const t = createTranslator(await getRequestLocale());
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageSkeleton label={t('states.loading')} />
    </div>
  );
}
