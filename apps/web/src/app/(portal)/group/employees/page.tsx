import { Card, EmptyState, PageHeader, Pagination, StatCard } from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { EmployeesTable } from '@/components/group/group-tables';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  employeeHistoryHref,
  employmentStatusKey,
  employeesHref,
  employeesState,
  entityChoices,
  formatPeriod,
  GROUP_EMPLOYEES_PATH,
  periodOptions,
  type SearchParams,
} from '@/lib/group-view';
import { pageCount, paginationLabels } from '@/lib/pagination';
import { roleLabel } from '@/lib/viewer-display';
import { listEmployees, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface EmployeesPageProps {
  searchParams?: Promise<SearchParams>;
}

const PAGE_SIZE = 25;

/**
 * Figma "Group employee data" (R2-03, R2-04): one record per employee for the month, the version
 * in use for each subsidiary. Sirius HR see every subsidiary, subsidiary HR their own (R2-12).
 * Figma issues fixed here: a subsidiary user never sees other subsidiaries' rows.
 */
export default async function EmployeesPage({ searchParams }: EmployeesPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:read')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const state = employeesState((await searchParams) ?? {}, new Date());
  const data = required(
    await listEmployees({
      period: state.period,
      entityId: state.entity,
      department: state.department,
      search: state.search,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
  );
  const pages = pageCount(data.total, data.pageSize);
  if (data.total > 0 && state.page > pages) redirect(employeesHref(state, { page: pages }));
  const number = new Intl.NumberFormat(locale);
  const { summary } = data;

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('group.employees.heading')}
        description={t('group.employees.intro', { period: formatPeriod(state.period, locale) })}
      />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t('group.employees.subsidiariesWithData')}
          value={t('group.employees.ofTotal', {
            count: number.format(summary.entitiesWithData),
            total: number.format(summary.entities),
          })}
        />
        <StatCard label={t('group.employees.records')} value={number.format(data.total)} />
        <StatCard label={t('group.employees.versions')} value={number.format(summary.versions)} />
        <StatCard
          label={t('group.employees.lastChange')}
          value={summary.lastChange === null ? '—' : summary.lastChange.entityCode}
          hint={
            summary.lastChange === null
              ? undefined
              : t('group.employees.lastChangeHint', {
                  version: number.format(summary.lastChange.version),
                  date: formatDateTime(summary.lastChange.at, locale),
                })
          }
        />
      </div>
      <Card className="mt-6">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <DashboardFilters
            path={GROUP_EMPLOYEES_PATH}
            hidden={{}}
            search={state.search ?? ''}
            selects={[
              {
                name: 'period',
                label: t('group.month'),
                value: state.period,
                options: periodOptions(new Date(), locale),
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
                  ...data.departments.map((department) => ({
                    value: department,
                    label: department,
                  })),
                ],
              },
            ]}
            labels={{
              filters: t('group.filters'),
              search: t('group.search'),
              searchPlaceholder: t('group.employees.searchPlaceholder'),
              applySearch: t('group.apply'),
            }}
          />
          {data.total === 0 ? (
            <EmptyState
              icon="users"
              title={t('group.employees.emptyTitle')}
              description={t('group.employees.emptyBody')}
            />
          ) : (
            <>
              <EmployeesTable
                rows={data.items.map((item) => ({
                  id: item.id,
                  name: item.fullName,
                  number: item.employeeNumber,
                  entity: item.entity.code,
                  department: item.department,
                  grade: item.grade,
                  salary:
                    item.grossSalary === null
                      ? '—'
                      : formatMoney(item.grossSalary, item.currency, locale),
                  status: t(employmentStatusKey(item.status)),
                  version: t('group.versionNumber', {
                    version: number.format(item.upload.version),
                  }),
                  href: employeeHistoryHref(item.id),
                }))}
                labels={{
                  caption: t('group.employees.heading'),
                  employee: t('group.employees.colEmployee'),
                  subsidiary: t('group.subsidiary'),
                  department: t('group.department'),
                  grade: t('group.employees.colGrade'),
                  salary: t('group.employees.colSalary'),
                  status: t('group.employees.colStatus'),
                  version: t('group.employees.colVersion'),
                }}
              />
              {pages > 1 ? (
                <Pagination
                  page={state.page}
                  pageCount={pages}
                  hrefFor={(target) => employeesHref(state, { page: target })}
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
