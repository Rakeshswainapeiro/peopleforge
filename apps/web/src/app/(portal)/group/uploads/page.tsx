import { Card, EmptyState, PageHeader, Pagination } from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { UploadsTable } from '@/components/group/group-tables';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatDateTime } from '@/lib/format';
import {
  entityChoices,
  GROUP_UPLOADS_PATH,
  periodOptions,
  uploadRows,
  uploadsHref,
  uploadsState,
  type SearchParams,
} from '@/lib/group-view';
import { pageCount, paginationLabels } from '@/lib/pagination';
import { roleLabel } from '@/lib/viewer-display';
import { listUploads, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface UploadsPageProps {
  searchParams?: Promise<SearchParams>;
}

/**
 * Upload history (R2-01, R2-04): every file uploaded, accepted, replaced or rejected, with its
 * version. Subsidiary HR see their own subsidiaries only (R2-12).
 */
export default async function UploadsPage({ searchParams }: UploadsPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:read')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const state = uploadsState((await searchParams) ?? {});
  const { entities } = me;
  const data = required(
    await listUploads({ entityId: state.entity, period: state.period, page: state.page }),
  );
  const pages = pageCount(data.total, data.pageSize);
  if (data.total > 0 && state.page > pages) redirect(uploadsHref(state, { page: pages }));

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('group.uploads.heading')}
        description={t('group.uploads.intro')}
      />
      <Card className="mt-6">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <DashboardFilters
            path={GROUP_UPLOADS_PATH}
            hidden={{}}
            selects={[
              {
                name: 'period',
                label: t('group.month'),
                value: state.period ?? '',
                options: [
                  { value: '', label: t('group.allMonths') },
                  ...periodOptions(new Date(), locale),
                ],
              },
              ...(entities.length > 1
                ? [
                    {
                      name: 'entity',
                      label: t('group.subsidiary'),
                      value: state.entity ?? '',
                      options: entityChoices(entities, t),
                    },
                  ]
                : []),
            ]}
            labels={{
              filters: t('group.filters'),
              search: t('group.search'),
              searchPlaceholder: t('group.search'),
              applySearch: t('group.apply'),
            }}
          />
          {data.total === 0 ? (
            <EmptyState
              icon="upload"
              title={t('group.uploads.emptyTitle')}
              description={t('group.uploads.emptyBody')}
            />
          ) : (
            <>
              <UploadsTable
                rows={uploadRows(data.items, locale, t, (iso) => formatDateTime(iso, locale))}
                labels={{
                  caption: t('group.uploads.heading'),
                  upload: t('group.uploads.colUpload'),
                  month: t('group.uploads.colMonth'),
                  status: t('group.uploads.colStatus'),
                  rows: t('group.uploads.colRows'),
                  problems: t('group.uploads.colProblems'),
                  flags: t('group.uploads.colFlags'),
                }}
              />
              {pages > 1 ? (
                <Pagination
                  page={state.page}
                  pageCount={pages}
                  hrefFor={(target) => uploadsHref(state, { page: target })}
                  as={Link}
                  labels={paginationLabels('group', state.page, pages, locale, t)}
                />
              ) : null}
            </>
          )}
        </div>
      </Card>
    </>
  );
}
