import { Alert, ButtonLink, Card, CardBody, CardHeader, PageHeader } from '@peopleforge/ui';
import Link from 'next/link';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator, type MessageKey } from '@/i18n/translator';
import { employeesAdded } from '@/lib/request-view';
import { listRequests } from '@/server/increment-requests';
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
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  // Figma "Needs your action": the caller's drafts, newest first.
  const drafts = me.permissions.includes('increment_request:create')
    ? await listRequests({ status: 'draft', pageSize: 10 })
    : undefined;

  return (
    <>
      <PageHeader title={t('home.heading')} description={t('home.intro')} />
      {me.permissions.length === 0 ? (
        <Alert tone="warning" title={t('account.noPermissions')} className="mt-6" />
      ) : null}
      {drafts?.kind === 'ok' && drafts.data.items.length > 0 ? (
        <section
          aria-labelledby="drafts-title"
          className="mt-6 rounded-card border border-warning-200 bg-warning-50/60 p-4"
        >
          <h2 id="drafts-title" className="text-sm font-semibold text-warning-700">
            {t('request.draftsTitle')}
          </h2>
          <ul className="mt-3 space-y-2">
            {drafts.data.items.map((draft) => (
              <li
                key={draft.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {t('request.draftItem', { reference: draft.reference })}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {employeesAdded(draft.employeeCount, locale, t)}
                  </p>
                </div>
                <ButtonLink href={`/requests/${draft.id}`} variant="outline" size="sm" as={Link}>
                  {t('request.continueDraft')}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </section>
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
