import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator, type MessageKey } from '@/i18n/translator';
import { requireViewer } from '@/server/session';

const AREAS: readonly { title: MessageKey; body: MessageKey; ref: string }[] = [
  { title: 'home.incrementPortalTitle', body: 'home.incrementPortalBody', ref: 'R1' },
  { title: 'home.groupDashboardTitle', body: 'home.groupDashboardBody', ref: 'R2' },
];

/** Landing page. The portal layout handles sign-in redirects and the API-unavailable notice. */
export default async function HomePage() {
  const me = await requireViewer();
  if (me === null) return null;
  const t = createTranslator(await getRequestLocale());

  return (
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
  );
}
