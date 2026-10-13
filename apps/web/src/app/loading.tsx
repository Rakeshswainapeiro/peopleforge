import { Skeleton, Spinner } from '@peopleforge/ui';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';

/** Page skeleton while the server renders: the shape of a header and two cards. */
export default async function Loading() {
  const t = createTranslator(await getRequestLocale());
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-sm text-ink-muted"
      >
        <Spinner />
        {t('states.loading')}
      </div>
      <Skeleton className="mt-6 h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
