import {
  Badge,
  Card,
  CardHeader,
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
import { ColumnChart } from '@/components/charts/charts';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { PrintButton } from '@/components/print-button';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatMoney } from '@/lib/format';
import {
  dashboardState,
  EXECUTIVE_PATH,
  movement,
  plainPercent,
  shortMonth,
  signedPercent,
} from '@/lib/group-dashboards-view';
import { formatPeriod, periodOptions, type SearchParams } from '@/lib/group-view';
import { getExecutiveView, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface ExecutivePageProps {
  searchParams?: Promise<SearchParams>;
}

/**
 * DASH-D8 Executive / IHC view (R2-07): the group's month on one page — headcount, movement,
 * payroll per currency, each subsidiary's totals, missing uploads and open flags, and the
 * 12-month trend. Aggregates only: no names, no individual pay. Print-friendly ("Print / Save as
 * PDF") so Sirius HR can send it to IHC (no IHC login). Not designed in Figma yet.
 */
export default async function ExecutivePage({ searchParams }: ExecutivePageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  if (me.scope !== 'group' || !me.permissions.includes('report:read_executive')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const now = new Date();
  const state = dashboardState((await searchParams) ?? {}, now);
  const view = required(await getExecutiveView(state.period));
  const number = new Intl.NumberFormat(locale);
  const count = (value: number) => number.format(value);
  const period = formatPeriod(view.period, locale);

  return (
    <>
      <PageHeader
        eyebrow={t('groupDashboards.executive.eyebrow')}
        title={t('groupDashboards.executive.heading', { period })}
        description={t('groupDashboards.executive.intro', {
          count: count(view.entitiesWithData),
          total: count(view.entities),
        })}
        actions={<PrintButton label={t('groupDashboards.executive.print')} />}
      />
      <Card className="mt-6 print:hidden">
        <div className="p-4 sm:p-6">
          <DashboardFilters
            path={EXECUTIVE_PATH}
            hidden={{}}
            selects={[
              {
                name: 'period',
                label: t('group.month'),
                value: state.period,
                options: periodOptions(now, locale),
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
        <StatCard
          label={t('groupDashboards.movement')}
          value={movement(view.joiners, view.leavers, locale)}
          hint={t('groupDashboards.turnover', {
            percent: plainPercent(view.turnoverPercent, locale),
          })}
        />
        <StatCard
          label={t('groupDashboards.femaleShare')}
          value={plainPercent(view.femaleSharePercent, locale)}
        />
        <StatCard label={t('groupDashboards.executive.openFlags')} value={count(view.openFlags)} />
      </div>
      {view.payroll.length === 0 ? null : (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {view.payroll.map((entry) => (
            <StatCard
              key={entry.currency}
              label={t('groupDashboards.compensation.payroll', { currency: entry.currency })}
              value={formatMoney(entry.amount, entry.currency, locale)}
              hint={t('groupDashboards.executive.change', {
                percent: signedPercent(entry.changePercent, locale),
              })}
            />
          ))}
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-2 print:grid-cols-1">
        <Card label={t('groupDashboards.executive.bySubsidiary')}>
          <CardHeader title={t('groupDashboards.executive.bySubsidiary')} />
          <div className="px-4 pb-4 sm:px-6">
            <Table caption={t('groupDashboards.executive.bySubsidiary')}>
              <THead>
                <tr>
                  <Th>{t('group.subsidiary')}</Th>
                  <Th align="end">{t('groupDashboards.headcount')}</Th>
                  <Th align="end">{t('groupDashboards.executive.payroll')}</Th>
                  <Th align="end">{t('groupDashboards.executive.openFlags')}</Th>
                </tr>
              </THead>
              <TBody>
                {view.byEntity.map((entry) => (
                  <Tr key={entry.entity.id}>
                    <Td className="font-semibold">
                      {entry.entity.code}
                      {entry.missing ? ' ' : null}
                      {entry.missing ? (
                        <Badge tone="warning" className="ms-1">
                          {t('groupDashboards.executive.notUploaded')}
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-end tabular-nums">
                      {entry.missing ? '—' : count(entry.headcount)}
                    </Td>
                    <Td className="text-end tabular-nums">
                      {Object.entries(entry.payroll).length === 0
                        ? '—'
                        : Object.entries(entry.payroll)
                            .map(([currency, amount]) => formatMoney(amount, currency, locale))
                            .join(' · ')}
                    </Td>
                    <Td className="text-end tabular-nums">{count(entry.openFlags)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
        <Card label={t('groupDashboards.trend')}>
          <CardHeader title={t('groupDashboards.trend')} />
          <div className="px-4 pt-4 pb-6 sm:px-6">
            <ColumnChart
              label={t('groupDashboards.trend')}
              columns={{
                label: t('groupDashboards.colLabel'),
                value: t('groupDashboards.colValue'),
              }}
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
      </div>
      <p className="mt-6 text-xs text-ink-muted">{t('groupDashboards.executive.footnote')}</p>
    </>
  );
}
