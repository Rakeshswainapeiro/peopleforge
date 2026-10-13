import type { Translate, MessageKey } from '@/i18n/translator';

/** A screen whose slice is not built yet (design §8): says so instead of a blank page. */
export function PlaceholderPage({
  t,
  title,
  body,
}: {
  t: Translate;
  title: MessageKey;
  body: MessageKey;
}) {
  return (
    <>
      <h1 className="text-3xl font-bold">{t(title)}</h1>
      <p className="mt-3 max-w-prose text-slate-700">{t(body)}</p>
      <p role="status" className="mt-6 rounded-md bg-slate-100 p-4 text-sm text-slate-700">
        {t('home.comingSoon')}
      </p>
    </>
  );
}
