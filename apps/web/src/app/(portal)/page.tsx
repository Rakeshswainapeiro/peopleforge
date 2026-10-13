import { Alert, Card, CardBody, CardHeader, PageHeader } from '@peopleforge/ui';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator, type MessageKey } from '@/i18n/translator';
import { requireViewer } from '@/server/session';

const AREAS: readonly { title: MessageKey; body: MessageKey; ref: string }[] = [
  { title: 'home.incrementPortalTitle', body: 'home.incrementPortalBody', ref: 'R1' },
  { title: 'home.groupDashboardTitle', body: 'home.groupDashboardBody', ref: 'R2' },
];

/**
 * Landing page until the R1 dashboard (Figma "My increment requests") lands in a later slice.
 * The portal layout handles sign-in redirects and the API-unavailable notice.
 */
export default async function HomePage() {
  const me = await requireViewer();
  if (me === null) return null;
  const t = createTranslator(await getRequestLocale());

  return (
    <>
      <PageHeader title={t('home.heading')} description={t('home.intro')} />
      {me.permissions.length === 0 ? (
        <Alert tone="warning" title={t('account.noPermissions')} className="mt-6" />
      ) : null}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {AREAS.map((area) => (
          <li key={area.ref} data-requirement={area.ref}>
            <Card className="h-full">
              <CardHeader title={t(area.title)} description={t('home.comingSoon')} />
              <CardBody className="pt-3 text-sm text-ink-muted">{t(area.body)}</CardBody>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
