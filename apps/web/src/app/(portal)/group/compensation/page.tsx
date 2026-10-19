import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@peopleforge/ui';
import { notFound } from 'next/navigation';
import { ColumnChart, RangeChart } from '@/components/charts/charts';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatMoney } from '@/lib/format';
import {
  bucketKey,
  compact,
  COMPENSATION_PATH,
  dashboardState,
  plainPercent,
  shortMonth,
  signedPercent,
} from '@/lib/group-dashboards-view';
import { entityChoices, formatPeriod, periodOptions, type SearchParams } from '@/lib/group-view';
import { roleLabel } from '@/lib/viewer-display';
import { getCompensation, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface CompensationPageProps {
  searchParams?: Promise<SearchParams>;
}

/**
 * Figma "Compensation trends" (DASH-D6, R2-05): monthly payroll per currency and its trend,
 * average salary per grade against its band, and the increments approved in the Increment
 * Portal this year with their cost. Totals only; amounts in different currencies are shown
 * apart, never added. Figma issue fixed: the trend is labelled payroll, not headcount.
 */
export default async function CompensationPage({ searchParams }: CompensationPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:read_compensation')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const now = new Date();
  const state = dashboardState((await searchParams) ?? {}, now);
  const view = required(
    await getCompensation({
      period: state.period,
      entityId: state.entity,
      department: state.department,
    }),
  );
  const number = new Intl.NumberFormat(locale);
  const columns = { label: t('groupDashboards.colLabel'), value: t('groupDashboards.colValue') };
  const currencies = view.payroll.map((entry) => entry.currency);

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('groupDashboards.compensation.heading')}
        description={t('groupDashboards.compensation.intro', {
          period: formatPeriod(view.period, locale),
        })}
      />
      <Card className="mt-6">
        <div className="p-4 sm:p-6">
          <DashboardFilters
            path={COMPENSATION_PATH}
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
      {view.payroll.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon="chart"
            title={t('groupDashboards.emptyTitle')}
            description={t('groupDashboards.emptyBody')}
          />
        </Card>
      ) : (
        view.payroll.map((entry) => (
          <section
            key={entry.currency}
            aria-label={t('groupDashboards.compensation.currency', { currency: entry.currency })}
            className="mt-6 flex flex-col gap-6"
          >
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label={t('groupDashboards.compensation.payroll', { currency: entry.currency })}
                value={formatMoney(entry.amount, entry.currency, locale)}
              />
              <StatCard
                label={t('groupDashboards.compensation.change')}
                value={signedPercent(entry.changePercent, locale)}
                hint={
                  entry.previousAmount === null
                    ? t('groupDashboards.compensation.noPrevious')
                    : t('groupDashboards.compensation.fromAmount', {
                        amount: formatMoney(entry.previousAmount, entry.currency, locale),
                      })
                }
              />
              <StatCard
                label={t('groupDashboards.compensation.average')}
                value={formatMoney(entry.average, entry.currency, locale)}
              />
              <StatCard
                label={t('groupDashboards.headcount')}
                value={number.format(entry.headcount)}
              />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card label={t('groupDashboards.compensation.trend', { currency: entry.currency })}>
                <CardHeader
                  title={t('groupDashboards.compensation.trend', { currency: entry.currency })}
                />
                <div className="px-4 pt-4 pb-6 sm:px-6">
                  <ColumnChart
                    label={t('groupDashboards.compensation.trend', { currency: entry.currency })}
                    columns={columns}
                    emptyLabel={t('groupDashboards.noData')}
                    points={view.trend.map((point) => {
                      const amount = new Map(Object.entries(point.payroll)).get(entry.currency);
                      return {
                        id: point.period,
                        label: shortMonth(point.period, locale),
                        value: amount === undefined ? null : Number(amount),
                        display: amount === undefined ? '—' : compact(amount, locale),
                      };
                    })}
                  />
                </div>
              </Card>
              <Card label={t('groupDashboards.compensation.byGrade', { currency: entry.currency })}>
                <CardHeader
                  title={t('groupDashboards.compensation.byGrade', { currency: entry.currency })}
                  description={t('groupDashboards.compensation.byGradeNote')}
                />
                <div className="px-4 pt-4 pb-6 sm:px-6">
                  <RangeChart
                    label={t('groupDashboards.compensation.byGrade', { currency: entry.currency })}
                    columns={{
                      label: t('groupDashboards.compensation.grade'),
                      value: t('groupDashboards.compensation.average'),
                      band: t('groupDashboards.compensation.band'),
                    }}
                    rows={view.grades
                      .filter((grade) => grade.currency === entry.currency)
                      .map((grade) => ({
                        id: grade.grade,
                        label: grade.grade,
                        value: Number(grade.average),
                        display: formatMoney(grade.average, grade.currency, locale),
                        band:
                          grade.band === null
                            ? null
                            : { min: Number(grade.band.min), max: Number(grade.band.max) },
                        bandDisplay:
                          grade.band === null
                            ? t('groupDashboards.compensation.noBand')
                            : `${formatMoney(grade.band.min, grade.currency, locale)} – ${formatMoney(grade.band.max, grade.currency, locale)}`,
                      }))}
                  />
                </div>
              </Card>
            </div>
          </section>
        ))
      )}
      <Card className="mt-6" label={t('groupDashboards.compensation.incrementsTitle')}>
        <CardHeader
          title={t('groupDashboards.compensation.incrementsTitle')}
          description={
            view.increments.approved === 0
              ? t('groupDashboards.compensation.incrementsNone', { year: view.period.slice(0, 4) })
              : t('groupDashboards.compensation.incrementsIntro', {
                  year: view.period.slice(0, 4),
                  count: number.format(view.increments.approved),
                  percent: plainPercent(view.increments.averagePercent, locale),
                })
          }
        />
        {view.increments.approved === 0 ? (
          <div aria-hidden="true" className="pb-6" />
        ) : (
          <div className="grid gap-6 px-4 pt-4 pb-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ColumnChart
              label={t('groupDashboards.compensation.distribution')}
              columns={columns}
              emptyLabel={t('groupDashboards.noData')}
              points={view.increments.distribution.map((entry) => ({
                id: entry.bucket,
                label: t(bucketKey(entry.bucket)),
                value: entry.count,
                display: number.format(entry.count),
              }))}
            />
            <Table caption={t('groupDashboards.compensation.costImpact')}>
              <THead>
                <tr>
                  <Th>{t('group.subsidiary')}</Th>
                  <Th align="end">{t('groupDashboards.compensation.employees')}</Th>
                  <Th align="end">{t('groupDashboards.compensation.monthly')}</Th>
                  <Th align="end">{t('groupDashboards.compensation.annual')}</Th>
                </tr>
              </THead>
              <TBody>
                {view.increments.costImpact.map((entry) => (
                  <Tr key={`${entry.entity.id}:${entry.currency}`}>
                    <Td>{entry.entity.code}</Td>
                    <Td className="text-end tabular-nums">{number.format(entry.employees)}</Td>
                    <Td className="text-end tabular-nums">
                      {formatMoney(entry.monthlyIncrease, entry.currency, locale)}
                    </Td>
                    <Td className="text-end tabular-nums">
                      {formatMoney(entry.annualIncrease, entry.currency, locale)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
      {currencies.length > 1 ? (
        <p className="mt-4 text-xs text-ink-muted">
          {t('groupDashboards.compensation.currencies')}
        </p>
      ) : null}
    </>
  );
}
