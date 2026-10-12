import { LanguageSwitcher } from '@/components/language-switcher';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator, type MessageKey } from '@/i18n/translator';

const AREAS: readonly { title: MessageKey; body: MessageKey; ref: string }[] = [
  { title: 'home.incrementPortalTitle', body: 'home.incrementPortalBody', ref: 'R1' },
  { title: 'home.groupDashboardTitle', body: 'home.groupDashboardBody', ref: 'R2' },
];

/**
 * Landing page. Feature entry points are shown disabled until SSO is configured (A6); this
 * screen also hosts the en ↔ ar RTL demonstration.
 */
export default async function HomePage() {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <p className="text-lg font-semibold">{t('app.name')}</p>
          <LanguageSwitcher locale={locale} t={t} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold">{t('home.heading')}</h1>
        <p className="mt-3 max-w-prose text-start text-slate-700">{t('home.intro')}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {AREAS.map((area) => (
            <li
              key={area.ref}
              data-requirement={area.ref}
              className="rounded-lg border border-slate-200 bg-white p-5 ps-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold">{t(area.title)}</h2>
              <p className="mt-2 text-slate-700">{t(area.body)}</p>
              <p className="mt-4 text-sm text-slate-500">{t('home.comingSoon')}</p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
