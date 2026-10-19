import { Card, CardHeader, EmptyState, PageHeader, StatCard } from '@peopleforge/ui';
import { notFound } from 'next/navigation';
import { BarList, ColumnChart } from '@/components/charts/charts';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import {
  ageBandKey,
  dashboardState,
  OVERVIEW_PATH,
  plainPercent,
  shortMonth,
} from '@/lib/group-dashboards-view';
import { entityChoices, formatPeriod, periodOptions, type SearchParams } from '@/lib/group-view';
import { roleLabel } from '@/lib/viewer-display';
import { getGroupOverview, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface OverviewPageProps {
  searchParams?: Promise<SearchParams>;
}

/**
 * Figma "Group employee overview" (DASH-D5, R2-05): headcount, movement, gender and age, by
 * subsidiary, department and grade, and the 12-month trend, for the month in use. Subsidiary HR
 * see their own subsidiary (R2-12). Figma issues fixed: every figure comes from the same month's
 * totals, so the cards, charts and tables agree.
 */
export default async function OverviewPage({ searchParams }: OverviewPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:read')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const now = new Date();
  const state = dashboardState((await searchParams) ?? {}, now);
  const view = required(
    await getGroupOverview({
      period: state.period,
      entityId: state.entity,
      department: state.department,
    }),
  );
  const number = new Intl.NumberFormat(locale);
  const count = (value: number) => number.format(value);
  const columns = { label: t('groupDashboards.colLabel'), value: t('groupDashboards.colValue') };

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('groupDashboards.overview.heading')}
        description={t('groupDashboards.overview.intro', {
          period: formatPeriod(view.period, locale),
          count: count(view.entitiesWithData),
          total: count(view.entities),
        })}
      />
      <Card className="mt-6">
        <div className="p-4 sm:p-6">
          <DashboardFilters
            path={OVERVIEW_PATH}
            hidden={{}}
            selects={[
              {
                name: 'period',
                label: t('group.month'),
                value: state.period,
                options: periodOptions(now, locale),
              },
              ...(me.entities.length > 1
                ? [
                    {
                      name: 'entity',
                      label: t('group.subsidiary'),
                      value: state.entity ?? '',
                      options: entityChoices(me.entities, t),
                    },
                  ]
                : []),
              {
                name: 'department',
                label: t('group.department'),
                value: state.department ?? '',
                options: [
                  { value: '', label: t('group.allDepartments') },
                  ...view.departments.map((department) => ({
                    value: department,
                    label: department,
                  })),
                ],
              },
            ]}
            labels={{
              filters: t('group.filters'),
              search: t('group.search'),
              searchPlaceholder: t('group.search'),
              applySearch: t('group.apply'),
            }}
          />
        </div>
      </Card>
      {view.entitiesWithData === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon="users"
            title={t('groupDashboards.emptyTitle')}
            description={t('groupDashboards.emptyBody')}
          />
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label={t('groupDashboards.headcount')}
              value={count(view.headcount)}
              hint={
                view.previousHeadcount === null
                  ? undefined
                  : t('groupDashboards.fromLastMonth', { count: count(view.previousHeadcount) })
              }
            />
            <StatCard label={t('groupDashboards.joiners')} value={count(view.joiners)} />
            <StatCard
              label={t('groupDashboards.leavers')}
              value={count(view.leavers)}
              hint={t('groupDashboards.turnover', {
                percent: plainPercent(view.turnoverPercent, locale),
              })}
            />
            <StatCard
              label={t('groupDashboards.femaleShare')}
              value={plainPercent(view.femaleSharePercent, locale)}
              hint={t('groupDashboards.ofHeadcount', {
                count: count(view.female),
                total: count(view.headcount),
              })}
            />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card label={t('groupDashboards.trend')}>
              <CardHeader title={t('groupDashboards.trend')} />
              <div className="px-4 pt-4 pb-6 sm:px-6">
                <ColumnChart
                  label={t('groupDashboards.trend')}
                  columns={columns}
                  emptyLabel={t('groupDashboards.noData')}
                  points={view.trend.map((point) => ({
                    id: point.period,
                    label: shortMonth(point.period, locale),
                    value: point.headcount,
                    display: point.headcount === null ? '—' : count(point.headcount),
                  }))}
                />
              </div>
            </Card>
            {view.byEntity.length > 1 ? (
              <Card label={t('groupDashboards.bySubsidiary')}>
                <CardHeader title={t('groupDashboards.bySubsidiary')} />
                <div className="px-4 pt-4 pb-6 sm:px-6">
                  <BarList
                    label={t('groupDashboards.bySubsidiary')}
                    columns={columns}
                    points={view.byEntity.map((entry) => ({
                      id: entry.entity.id,
                      label: entry.entity.code,
                      value: entry.headcount,
                      display: count(entry.headcount),
                    }))}
                  />
                </div>
              </Card>
            ) : null}
            <Card label={t('groupDashboards.byDepartment')}>
              <CardHeader title={t('groupDashboards.byDepartment')} />
              <div className="px-4 pt-4 pb-6 sm:px-6">
                <BarList
                  label={t('groupDashboards.byDepartment')}
                  columns={columns}
                  points={view.byDepartment.map((entry) => ({
                    id: entry.department,
                    label: entry.department,
                    value: entry.headcount,
                    display: count(entry.headcount),
                  }))}
                />
              </div>
            </Card>
            <Card label={t('groupDashboards.gender')}>
              <CardHeader title={t('groupDashboards.gender')} />
              <div className="px-4 pt-4 pb-6 sm:px-6">
                <BarList
                  label={t('groupDashboards.gender')}
                  columns={columns}
                  points={(
                    [
                      ['female', view.gender.female],
                      ['male', view.gender.male],
                      ['other', view.gender.other],
                    ] as const
                  ).map(([key, value]) => ({
                    id: key,
                    label: t(`groupDashboards.genders.${key}`),
                    value,
                    display: count(value),
                  }))}
                />
              </div>
            </Card>
            <Card label={t('groupDashboards.age')}>
              <CardHeader title={t('groupDashboards.age')} />
              <div className="px-4 pt-4 pb-6 sm:px-6">
                <ColumnChart
                  label={t('groupDashboards.age')}
                  columns={columns}
                  emptyLabel={t('groupDashboards.noData')}
                  points={view.ageBands.map((entry) => ({
                    id: entry.band,
                    label: t(ageBandKey(entry.band)),
                    value: entry.count,
                    display: count(entry.count),
                  }))}
                />
              </div>
            </Card>
            <Card label={t('groupDashboards.byGrade')}>
              <CardHeader title={t('groupDashboards.byGrade')} />
              <div className="px-4 pt-4 pb-6 sm:px-6">
                <BarList
                  label={t('groupDashboards.byGrade')}
                  columns={columns}
                  points={view.grades.map((entry) => ({
                    id: entry.grade,
                    label: entry.grade,
                    value: entry.headcount,
                    display: count(entry.headcount),
                  }))}
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
