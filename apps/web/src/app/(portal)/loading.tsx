import { PageSkeleton } from '@/components/page-skeleton';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';

/**
 * Between portal pages: the sidebar stays where it is and only the content area shows the
 * page's shape, so a click responds at once.
 */
export default async function PortalLoading() {
  const t = createTranslator(await getRequestLocale());
  return <PageSkeleton label={t('states.loading')} />;
}
