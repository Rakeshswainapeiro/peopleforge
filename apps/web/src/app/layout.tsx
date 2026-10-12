import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { directionFor } from '@sirius-hr/shared-types';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getRequestLocale());
  return { title: t('app.name'), description: t('app.tagline') };
}

/** `lang` and `dir` come from the viewer's preference so the whole tree mirrors for Arabic. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <html lang={locale} dir={directionFor(locale)}>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:rounded focus:bg-white focus:px-3 focus:py-2"
        >
          {t('nav.skipToContent')}
        </a>
        {children}
      </body>
    </html>
  );
}
