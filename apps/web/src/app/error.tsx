'use client';

import { resolveLocale } from '@sirius-hr/shared-types';
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
    <main id="main" role="alert" className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t('states.errorTitle')}</h1>
      <p className="mt-3 text-slate-700">
        {t('states.errorBody', { reference: error.digest ?? '—' })}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        {t('states.retry')}
      </button>
    </main>
  );
}
