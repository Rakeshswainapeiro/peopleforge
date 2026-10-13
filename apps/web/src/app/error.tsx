'use client';

import { Alert, Button } from '@peopleforge/ui';
import { resolveLocale } from '@sirius/shared-types';
import { createTranslator } from '@/i18n/translator';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route error boundary. Shows only the server-generated digest as a support reference — never
 * the error message, which may contain internals.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  // Client component: read the locale the server already rendered onto <html>.
  const t = createTranslator(resolveLocale(document.documentElement.lang));
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="sr-only">{t('states.errorTitle')}</h1>
      <Alert
        role="alert"
        tone="danger"
        title={t('states.errorTitle')}
        actions={
          <Button variant="secondary" size="sm" onClick={reset}>
            {t('states.retry')}
          </Button>
        }
      >
        {t('states.errorBody', { reference: error.digest ?? '—' })}
      </Alert>
    </main>
  );
}
