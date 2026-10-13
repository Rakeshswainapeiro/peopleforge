import { ButtonLink, Card, EmptyState } from '@peopleforge/ui';
import Link from 'next/link';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';

export default async function NotFound() {
  const t = createTranslator(await getRequestLocale());
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <Card>
        <h1 className="sr-only">{t('states.notFoundTitle')}</h1>
        <EmptyState
          icon="search"
          title={t('states.notFoundTitle')}
          description={t('states.notFoundBody')}
          action={
            <ButtonLink href="/" variant="secondary" icon="arrow-start" as={Link}>
              {t('states.backHome')}
            </ButtonLink>
          }
        />
      </Card>
    </main>
  );
}
