import { Alert, ButtonLink } from '@peopleforge/ui';
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
        <Alert
          role="alert"
          tone="warning"
          title={t('account.unavailableTitle')}
          actions={
            <ButtonLink href="/" variant="secondary" size="sm" as={Link}>
              {t('account.retry')}
            </ButtonLink>
          }
        >
          {t('account.unavailableBody')}
        </Alert>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar me={me} locale={locale} t={t} />
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
