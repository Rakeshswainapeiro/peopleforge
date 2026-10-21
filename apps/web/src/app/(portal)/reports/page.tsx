import {
  groupReportSpec,
  PAGE_SIZES,
  type DashboardFilter,
  type GroupReportCode,
} from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader } from '@peopleforge/ui';
import { notFound, redirect } from 'next/navigation';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { RequestsTable } from '@/components/dashboard/requests-table';
import { GroupReportCard } from '@/components/reports/group-report-card';
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
import { entityChoices } from '@/lib/group-view';
import {
  canReadIncrementReport,
  groupReportHref,
  groupReportsFor,
  REPORTS_PATH,
  reportHref,
  reportPeriodOptions,
} from '@/lib/report-view';
import { roleLabel } from '@/lib/viewer-display';
import type { Translate } from '@/i18n/translator';
import type { Me } from '@peopleforge/contracts';
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
 * Reports: RP-01, the increment status report (R1-14), with the dashboard's filters, a preview
 * and Excel / PDF downloads; then the group HR reports RP-03 … RP-07 (R2-06, R2-07) the reader
 * may run, each for a chosen period. Files come in the reader's language and every download is
 * audited (R1-15, R2-13).
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  const increments = canReadIncrementReport(me.permissions);
  const groupReports = groupReportsFor(me.permissions);
  if (!increments && groupReports.length === 0) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const group = me.scope === 'group';
  const rp01 = increments ? await incrementReport({ me, locale, t, searchParams }) : null;

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('reports.heading')}
        description={t(
          increments ? (group ? 'reports.introGroup' : 'reports.intro') : 'reports.introExecutive',
        )}
      />
      {rp01}
      {/* Never empty here: RP-01's readers have compensation access, so RP-04. */}
      <section aria-labelledby="group-reports" className="mt-8">
        <h2 id="group-reports" className="text-lg font-semibold tracking-tight text-ink">
          {t('reports.groupHeading')}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t('reports.groupIntro')}</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {groupReports.map((code) => (
            <GroupReportCard key={code} {...groupCardProps(code, me, locale, t)} />
          ))}
        </div>
      </section>
    </>
  );
}

function groupCardText(code: GroupReportCode, t: Translate): { title: string; body: string } {
  switch (code) {
    case 'rp-03':
      return { title: t('reports.group.rp03.title'), body: t('reports.group.rp03.body') };
    case 'rp-04':
      return { title: t('reports.group.rp04.title'), body: t('reports.group.rp04.body') };
    case 'rp-05':
      return { title: t('reports.group.rp05.title'), body: t('reports.group.rp05.body') };
    case 'rp-06':
      return { title: t('reports.group.rp06.title'), body: t('reports.group.rp06.body') };
    case 'rp-07':
      return { title: t('reports.group.rp07.title'), body: t('reports.group.rp07.body') };
  }
}

function groupCardProps(code: GroupReportCode, me: Me, locale: Locale, t: Translate) {
  const spec = groupReportSpec(code);
  const text = groupCardText(code, t);
  return {
    title: text.title,
    description: text.body,
    cadence: t(`reports.cadence.${spec.cadence}`),
    action: groupReportHref(code),
    period: {
      label: t(`reports.periodLabel.${spec.cadence}`),
      options: reportPeriodOptions(spec.cadence, new Date(), locale, t),
    },
    // Monthly reports can be cut by subsidiary for readers who see several.
    entity:
      spec.cadence === 'month' && me.entities.length > 1
        ? { label: t('group.subsidiary'), options: entityChoices(me.entities, t) }
        : undefined,
    formats: spec.formats.map((format) => ({
      value: format,
      label: t(format === 'xlsx' ? 'reports.downloadExcel' : 'reports.downloadPdf'),
    })),
  };
}

interface IncrementReportProps {
  me: Me;
  locale: Locale;
  t: Translate;
  searchParams: Promise<SearchParams> | undefined;
}

/** RP-01 (R1-14): the dashboard's filters, the match count, downloads and a preview. */
async function incrementReport({ me, locale, t, searchParams }: IncrementReportProps) {
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
