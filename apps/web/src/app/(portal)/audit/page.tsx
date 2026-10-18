import { Card, EmptyState, PageHeader, Pagination } from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuditFilters } from '@/components/audit/audit-filters';
import { AuditTable } from '@/components/audit/audit-table';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { auditHref, auditRows, auditState } from '@/lib/audit-view';
import { pageCount, paginationLabels } from '@/lib/pagination';
import { roleLabel } from '@/lib/viewer-display';
import { listAudit } from '@/server/audit';
import { requireViewer } from '@/server/session';

interface AuditPageProps {
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * The audit trail (R1-15, NFR-AUD-01) for `audit:read`: every recorded action, newest first,
 * filtered by text, person and dates. Read-only: the trail is append-only in the database.
 */
export default async function AuditPage({ searchParams }: AuditPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('audit:read')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const state = auditState(await searchParams);

  const result = await listAudit({
    search: state.search,
    actor: state.actor,
    from: state.from,
    to: state.to,
    page: state.page,
  });
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind !== 'ok') throw new Error('Audit trail unavailable');
  const data = result.data;
  const pages = pageCount(data.total, data.pageSize);
  if (data.total > 0 && state.page > pages) redirect(auditHref(state, { page: pages }));
  const rows = auditRows(data, state, locale, t);
  const actorName =
    state.actor === undefined
      ? undefined
      : (data.items.find((item) => item.actor === state.actor)?.actorName ?? state.actor);

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('audit.heading')}
        description={t('audit.intro')}
      />
      <Card className="mt-6">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <AuditFilters
            search={state.search ?? ''}
            from={state.from ?? ''}
            to={state.to ?? ''}
            actor={state.actor}
            labels={{
              filters: t('audit.filters'),
              search: t('audit.search'),
              searchPlaceholder: t('audit.searchPlaceholder'),
              from: t('audit.from'),
              to: t('audit.to'),
              apply: t('audit.apply'),
            }}
          />
          {actorName === undefined ? null : (
            <p className="flex flex-wrap items-center gap-3 text-sm text-ink">
              {t('audit.userFilter', { name: actorName })}
              <Link
                href={auditHref(state, { actor: undefined })}
                className="font-medium text-brand-600 underline-offset-2 hover:underline"
              >
                {t('audit.clearUser')}
              </Link>
            </p>
          )}
          {data.total === 0 ? (
            <EmptyState
              icon="search"
              title={t('audit.emptyTitle')}
              description={t('audit.emptyBody')}
            />
          ) : (
            <>
              <AuditTable
                rows={rows}
                labels={{
                  caption: t('audit.caption'),
                  when: t('audit.colWhen'),
                  who: t('audit.colWho'),
                  action: t('audit.colAction'),
                  subject: t('audit.colSubject'),
                  details: t('audit.colDetails'),
                  onlyUser: (name) => t('audit.onlyUserLabel', { name }),
                  onlyUserText: (name) => t('audit.onlyUser', { name }),
                }}
              />
              {pages > 1 ? (
                <Pagination
                  page={state.page}
                  pageCount={pages}
                  hrefFor={(target) => auditHref(state, { page: target })}
                  as={Link}
                  labels={paginationLabels('audit', state.page, pages, locale, t)}
                />
              ) : null}
            </>
          )}
        </div>
      </Card>
    </>
  );
}
