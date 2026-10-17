import { PAGE_SIZES } from '@peopleforge/contracts';
import { ButtonLink, Card, EmptyState, PageHeader, Pagination, ToggleGroup } from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { LinkSelect } from '@/components/link-select';
import { ReviewQueueTable } from '@/components/review/review-queue-table';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { entityOptions } from '@/lib/dashboard-view';
import { pageCount, paginationLabels } from '@/lib/pagination';
import { markStateLabels } from '@/lib/request-view';
import { queueChips, queueHref, queueRows, queueState, type SearchParams } from '@/lib/review-view';
import { roleLabel } from '@/lib/viewer-display';
import { reviewQueue } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';

interface ReviewQueuePageProps {
  searchParams: Promise<SearchParams>;
}

/**
 * Figma "Review queue" (R1-07): Sirius HR's list of employees to review across subsidiaries,
 * oldest first, with chips for what is to review, returned, past the reminder time, open or
 * everything. For reviewers only (`increment_request:review`, re-checked by the API).
 */
export default async function ReviewQueuePage({ searchParams }: ReviewQueuePageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('increment_request:review')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const state = queueState(await searchParams);

  const result = await reviewQueue({
    filter: state.filter,
    entityId: state.entity,
    search: state.search,
    page: state.page,
    pageSize: state.pageSize,
  });
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind !== 'ok') throw new Error('Review queue unavailable');
  const page = result.data;
  const pages = pageCount(page.total, state.pageSize);
  if (page.total > 0 && state.page > pages) redirect(queueHref(state, { page: pages }));
  const number = new Intl.NumberFormat(locale);
  const filtered = state.search !== undefined || state.entity !== undefined;

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('review.heading')}
        description={
          page.counts.openEntities === 0
            ? t('review.introNone')
            : t('review.intro', { count: number.format(page.counts.openEntities) })
        }
      />
      <Card className="mt-6">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <ToggleGroup
            as={Link}
            label={t('review.chips')}
            items={queueChips(page, state, t).map((chip) => ({
              href: chip.href,
              label: chip.label,
              count: chip.count,
              active: chip.active,
            }))}
          />
          <DashboardFilters
            path="/review"
            hidden={{
              ...(state.filter === 'pending' ? {} : { filter: state.filter }),
              ...(state.pageSize === PAGE_SIZES[0] ? {} : { size: String(state.pageSize) }),
            }}
            search={state.search ?? ''}
            selects={[
              {
                name: 'entity',
                label: t('dashboard.subsidiary'),
                value: state.entity ?? '',
                options: entityOptions(me.entities, t),
              },
            ]}
            labels={{
              filters: t('dashboard.filters'),
              search: t('dashboard.search'),
              searchPlaceholder: t('review.searchPlaceholder'),
              applySearch: t('dashboard.applySearch'),
            }}
          />
          {page.total === 0 ? (
            filtered ? (
              <EmptyState
                icon="search"
                title={t('review.noMatchTitle')}
                description={t('review.noMatchBody')}
                action={
                  <ButtonLink
                    href={queueHref(state, { search: undefined, entity: undefined })}
                    variant="secondary"
                    size="sm"
                    as={Link}
                  >
                    {t('dashboard.clearFilters')}
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState title={t('review.emptyTitle')} description={t('review.emptyBody')} />
            )
          ) : (
            <>
              <ReviewQueueTable
                rows={queueRows(page, new Date(), locale, t)}
                labels={{
                  caption: t('review.caption'),
                  employee: t('review.colEmployee'),
                  request: t('review.colRequest'),
                  proposed: t('review.colProposed'),
                  submitted: t('review.colSubmitted'),
                  verified: t('review.colVerified'),
                  waiting: t('review.colWaiting'),
                  status: t('dashboard.colStatus'),
                  action: t('review.colAction'),
                  stateLabels: markStateLabels(t),
                }}
              />
              <Pagination
                page={state.page}
                pageCount={pages}
                hrefFor={(target) => queueHref(state, { page: target })}
                as={Link}
                labels={paginationLabels('review', state.page, pages, locale, t)}
                pageSize={
                  <LinkSelect
                    label={t('dashboard.rowsPerPage')}
                    value={String(state.pageSize)}
                    options={PAGE_SIZES.map((size) => ({
                      value: String(size),
                      label: number.format(size),
                      href: queueHref(state, { pageSize: size }),
                    }))}
                  />
                }
              />
            </>
          )}
        </div>
      </Card>
    </>
  );
}
