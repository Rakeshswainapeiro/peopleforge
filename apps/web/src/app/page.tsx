import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SignOutButton } from '@/components/sign-out-button';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator, type MessageKey } from '@/i18n/translator';
import { currentViewer } from '@/server/session';

const AREAS: readonly { title: MessageKey; body: MessageKey; ref: string }[] = [
  { title: 'home.incrementPortalTitle', body: 'home.incrementPortalBody', ref: 'R1' },
  { title: 'home.groupDashboardTitle', body: 'home.groupDashboardBody', ref: 'R2' },
];

/**
 * Landing page for signed-in users. Identity, scope and permissions come from the API
 * (GET /api/v1/me), which re-checks the access token on every request; this page only decides
 * what to show. Also hosts the en ↔ ar RTL demonstration.
 */
export default async function HomePage() {
  const viewer = await currentViewer();
  if (viewer.kind === 'signed_out') redirect('/sign-in');
  if (viewer.kind === 'unauthenticated') redirect('/session-ended');

  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const me = viewer.kind === 'ok' ? viewer.me : null;

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <p className="text-lg font-semibold">{t('app.name')}</p>
          <div className="flex flex-wrap items-center gap-4">
            {me === null ? null : (
              <p className="text-sm text-slate-600">
                {t('account.signedInAs', { name: me.name ?? me.username ?? me.userId })}
              </p>
            )}
            <LanguageSwitcher locale={locale} t={t} />
            <SignOutButton t={t} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-10">
        {me === null ? (
          <section role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-5">
            <h1 className="text-xl font-semibold">{t('account.unavailableTitle')}</h1>
            <p className="mt-2 text-slate-700">{t('account.unavailableBody')}</p>
            <Link href="/" className="mt-4 inline-block text-sm font-medium text-sky-800 underline">
              {t('account.retry')}
            </Link>
          </section>
        ) : (
          <>
            <h1 className="text-3xl font-bold">{t('home.heading')}</h1>
            <p className="mt-3 max-w-prose text-start text-slate-700">{t('home.intro')}</p>
            {me.permissions.length === 0 ? (
              <p role="status" className="mt-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
                {t('account.noPermissions')}
              </p>
            ) : null}
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
          </>
        )}
      </main>
    </>
  );
}
