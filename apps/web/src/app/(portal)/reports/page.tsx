import { PAGE_SIZES, type DashboardFilter } from '@peopleforge/contracts';
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader } from '@peopleforge/ui';
import { notFound, redirect } from 'next/navigation';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { RequestsTable } from '@/components/dashboard/requests-table';
import { PlaceholderPage } from '@/components/placeholder-page';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { pluralForm } from '@peopleforge/i18n';
import {
  ALL_PERIODS,
  cycleFilter,
  dashboardState,
  entityOptions,
  periodOptions,
  requestRows,
  statusOptions,
  type SearchParams,
} from '@/lib/dashboard-view';
import { hasAnyPermission } from '@/lib/navigation';
import { canReadIncrementReport, REPORTS_PATH, reportHref } from '@/lib/report-view';
import { roleLabel } from '@/lib/viewer-display';
import type { ApiResult } from '@/server/api-client';
import { dashboardSummary, listRequests, openCycles } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';

interface ReportsPageProps {
  searchParams?: Promise<SearchParams>;
}

function required<T>(result: ApiResult<T>): T {
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind !== 'ok') throw new Error('Reports API unavailable');
  return result.data;
}

/**
 * Reports (R1-14): RP-01, the increment status report, with the dashboard's filters, a preview
 * and Excel / PDF downloads in the reader's language. Every download is audited (R1-15).
 * Executives' group reports arrive with R2.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!hasAnyPermission(me.permissions, ['report:read_operational', 'report:read_executive'])) {
    notFound();
  }
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  if (!canReadIncrementReport(me.permissions)) {
    return (
      <PlaceholderPage
        t={t}
        title="reports.executiveTitle"
        body="reports.executiveBody"
        icon="chart"
      />
    );
  }
  const group = me.scope === 'group';
  const state = dashboardState((await searchParams) ?? {});
  const cycles = required(await openCycles());
  const filter: DashboardFilter = {
    cycleId: cycleFilter(state, cycles),
    entityId: group ? state.entity : undefined,
    status: state.status,
    search: state.search,
  };
  const [summary, preview] = await Promise.all([
    dashboardSummary(filter).then(required),
    listRequests({ ...filter, page: 1, pageSize: PAGE_SIZES[0] }).then(required),
  ]);
  const number = new Intl.NumberFormat(locale);
  const now = new Date();

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('reports.heading')}
        description={t(group ? 'reports.introGroup' : 'reports.intro')}
      />
      <Card className="mt-6" label={t('reports.rp01Title')}>
        <CardHeader title={t('reports.rp01Title')} description={t('reports.rp01Body')} />
        <div className="flex flex-col gap-5 px-4 pt-4 pb-6 sm:px-6">
          <DashboardFilters
            path={REPORTS_PATH}
            hidden={{}}
            search={state.search ?? ''}
            selects={[
              {
                name: 'cycle',
                label: t('dashboard.period'),
                value: filter.cycleId ?? ALL_PERIODS,
                options: periodOptions(cycles, locale, t),
              },
              ...(group
                ? [
                    {
                      name: 'entity',
                      label: t('dashboard.subsidiary'),
                      value: state.entity ?? '',
                      options: entityOptions(me.entities, t),
                    },
                  ]
                : []),
              {
                name: 'status',
                label: t('dashboard.status'),
                value: state.status ?? '',
                options: statusOptions(t, group),
              },
            ]}
            labels={{
              filters: t('dashboard.filters'),
              search: t('dashboard.search'),
              searchPlaceholder: t('dashboard.searchPlaceholder'),
              applySearch: t('dashboard.applySearch'),
            }}
          />
          {/* Plain links (no client navigation): the route answers with an attachment. */}
          <div className="flex flex-col gap-3 rounded-control bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink" role="status">
                {t(`reports.matches.${pluralForm(summary.requests, locale)}`, {
                  requests: number.format(summary.requests),
                  employees: number.format(summary.employees),
                })}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{t('reports.logged')}</p>
            </div>
            {summary.requests === 0 ? null : (
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={reportHref(filter, 'xlsx')} icon="download">
                  {t('reports.downloadExcel')}
                </ButtonLink>
                <ButtonLink href={reportHref(filter, 'pdf')} icon="download" variant="outline">
                  {t('reports.downloadPdf')}
                </ButtonLink>
              </div>
            )}
          </div>
          {summary.requests === 0 ? (
            <EmptyState
              icon="search"
              title={t('reports.emptyTitle')}
              description={t('reports.emptyBody')}
            />
          ) : (
            <>
              <p className="text-xs text-ink-muted">
                {t('reports.preview', {
                  shown: number.format(preview.items.length),
                  total: number.format(preview.total),
                })}
              </p>
              <RequestsTable
                rows={requestRows(preview, state, now, locale, t, group)}
                showSubsidiary={group}
                labels={{
                  caption: t('reports.rp01Title'),
                  request: t('dashboard.colRequest'),
                  subsidiary: t('dashboard.colSubsidiary'),
                  created: t('dashboard.colCreated'),
                  employees: t('dashboard.colEmployees'),
                  stage: t('dashboard.colStage'),
                  status: t('dashboard.colStatus'),
                  age: t('dashboard.colAge'),
                  with: t('dashboard.colWith'),
                  submitted: t('dashboard.colSubmitted'),
                  view: t('dashboard.viewEmployees'),
                }}
              />
            </>
          )}
        </div>
      </Card>
    </>
  );
}
