import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/app-shell/sidebar';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { requireViewer } from '@/server/session';

/**
 * Signed-in portal: sidebar plus content. Identity, scope and permissions come from the API
 * (GET /api/v1/me), which re-checks the access token on every request.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const me = await requireViewer();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  if (me === null) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <section role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-5">
          <h1 className="text-xl font-semibold">{t('account.unavailableTitle')}</h1>
          <p className="mt-2 text-slate-700">{t('account.unavailableBody')}</p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-sky-800 underline">
            {t('account.retry')}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar me={me} locale={locale} t={t} />
      <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}
