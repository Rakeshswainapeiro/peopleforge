import {
  PAGE_SIZES,
  type DashboardFilter,
  type IncrementRequestPage,
  type Me,
  type RequestLinePage,
} from '@peopleforge/contracts';
import {
  Alert,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Pagination,
  StatCard,
  ToggleGroup,
} from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { EmployeesTable } from '@/components/dashboard/employees-table';
import { NeedsYourAction } from '@/components/dashboard/needs-your-action';
import { RequestsTable } from '@/components/dashboard/requests-table';
import { LinkSelect } from '@/components/link-select';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator, type MessageKey, type Translate } from '@/i18n/translator';
import {
  ALL_PERIODS,
  cycleFilter,
  dashboardHref,
  dashboardState,
  actionRows,
  entityOptions,
  kpiCards,
  lineRows,
  periodOptions,
  requestRows,
  statusOptions,
  type ActionFilter,
  type DashboardState,
  type SearchParams,
} from '@/lib/dashboard-view';
import { pageCount, paginationLabels } from '@/lib/pagination';
import { pluralForm } from '@peopleforge/i18n';
import { markStateLabels } from '@/lib/request-view';
import { entityName, roleLabel } from '@/lib/viewer-display';
import type { ApiResult } from '@/server/api-client';
import {
  dashboardSummary,
  listRequestLines,
  listRequests,
  openCycles,
} from '@/server/increment-requests';
import { requireViewer } from '@/server/session';

const AREAS: readonly { title: MessageKey; body: MessageKey; ref: string }[] = [
  { title: 'home.incrementPortalTitle', body: 'home.incrementPortalBody', ref: 'R1' },
  { title: 'home.groupDashboardTitle', body: 'home.groupDashboardBody', ref: 'R2' },
];

interface HomePageProps {
  searchParams?: Promise<SearchParams>;
}

/** The data a page needs, or a redirect / error page when the API can't give it. */
function required<T>(result: ApiResult<T>): T {
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind !== 'ok') throw new Error('Increment request API unavailable');
  return result.data;
}

/** For roles without increment requests (Executive, Admin): what Phase 1 offers. */
function Welcome({ t, me }: { t: Translate; me: Me }) {
  return (
    <>
      <PageHeader title={t('home.heading')} description={t('home.intro')} />
      {me.permissions.length === 0 ? (
        <Alert tone="warning" title={t('account.noPermissions')} className="mt-6" />
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

/**
 * Home. For subsidiary HR and Sirius HR: Figma "My increment requests" (R1-10, DASH-D1), with
 * the KPI cards, "Needs your action", and the requests By request or By employee. Other roles
 * see what Phase 1 offers them.
 */
export default async function HomePage({ searchParams }: HomePageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const params = (await searchParams) ?? {};
  const discarded =
    params.discarded === '1' ? (
      <Alert tone="success" title={t('request.discarded')} className="mt-6" />
    ) : null;
  if (!me.permissions.includes('increment_request:read')) {
    return (
      <>
        {discarded}
        <Welcome t={t} me={me} />
      </>
    );
  }
  return Dashboard({ me, state: dashboardState(params), locale, t, notice: discarded });
}

/** Which "Show" choice lists requests in this status. */
function toShow(status: 'draft' | 'returned'): ActionFilter {
  return status === 'draft' ? 'drafts' : 'returned';
}

/** The list on screen: its view and its data travel together. */
type Listing =
  { view: 'requests'; data: IncrementRequestPage } | { view: 'employees'; data: RequestLinePage };

interface DashboardProps {
  me: Me;
  state: DashboardState;
  locale: Locale;
  t: Translate;
  /** A one-off confirmation under the header (e.g. a discarded draft). */
  notice: ReactNode;
}

async function Dashboard({ me, state, locale, t, notice }: DashboardProps) {
  const preparer = me.permissions.includes('increment_request:create');
  const group = me.scope === 'group';
  const cycles = await openCycles();
  const openList = cycles.kind === 'ok' ? cycles.data : [];
  const filter: DashboardFilter = {
    cycleId: cycleFilter(state, openList),
    // Only Sirius HR picks a subsidiary; a subsidiary user's own are enforced by the API anyway.
    entityId: group ? state.entity : undefined,
    status: state.status,
    search: state.search,
  };
  const paging = { ...filter, page: state.page, pageSize: state.pageSize };
  const listing: Promise<Listing> =
    state.view === 'requests'
      ? listRequests(paging)
          .then(required)
          .then((data) => ({ view: 'requests', data }))
      : listRequestLines({ ...paging, requestId: state.requestId })
          .then(required)
          .then((data) => ({ view: 'employees', data }));
  // "Needs your action": drafts and returns in every cycle, longest waiting first (the API's
  // smallest page each; the panel shows the first ACTION_ROWS).
  const waiting = (status: 'draft' | 'returned') =>
    preparer && (state.show === undefined || state.show === 'all' || state.show === toShow(status))
      ? listRequests({ status, order: 'oldest', pageSize: PAGE_SIZES[0] }).then(required)
      : Promise.resolve(undefined);
  const [summary, list, drafts, returned] = await Promise.all([
    dashboardSummary(filter).then(required),
    listing,
    waiting('draft'),
    waiting('returned'),
  ]);
  const total = list.data.total;
  const pages = pageCount(total, state.pageSize);
  // A link past the last page (rows were removed since): show the last page instead.
  if (total > 0 && state.page > pages) redirect(dashboardHref(state, { page: pages }));
  const filtered = state.search !== undefined || state.status !== undefined;
  const number = new Intl.NumberFormat(locale);
  const entity = me.entities[0];
  const now = new Date();
  const actionItems = [...(drafts?.items ?? []), ...(returned?.items ?? [])];
  const draftCount = summary.byStatus.draft;
  const returnedCount = summary.byStatus.returned;
  const actionTotal = (drafts?.total ?? 0) + (returned?.total ?? 0);
  const actions = actionRows(actionItems, now, locale, t);

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t(group ? 'dashboard.titleGroup' : 'dashboard.title')}
        description={
          group || entity === undefined
            ? t('dashboard.introGroup')
            : t('dashboard.intro', { entity: entityName(entity, locale) })
        }
        actions={
          preparer ? (
            <ButtonLink href="/requests/new" icon="plus" as={Link}>
              {t('dashboard.newRequest')}
            </ButtonLink>
          ) : undefined
        }
      />
      {notice}

      {!preparer || draftCount + returnedCount === 0 ? null : (
        <NeedsYourAction
          total={actionTotal}
          rows={actions}
          seeAllHref={dashboardHref(state, {
            status: state.show === 'returned' ? 'returned' : 'draft',
            search: undefined,
          })}
          show={
            <LinkSelect
              label={t('dashboard.show')}
              value={state.show ?? 'all'}
              options={[
                {
                  value: 'all',
                  label: t('dashboard.showAll', {
                    count: number.format(draftCount + returnedCount),
                  }),
                  href: dashboardHref(state, { show: undefined, page: state.page }),
                },
                {
                  value: 'drafts',
                  label: t('dashboard.showDrafts', { count: number.format(draftCount) }),
                  href: dashboardHref(state, { show: 'drafts', page: state.page }),
                },
                {
                  value: 'returned',
                  label: t('dashboard.showReturned', { count: number.format(returnedCount) }),
                  href: dashboardHref(state, { show: 'returned', page: state.page }),
                },
              ]}
            />
          }
          labels={{
            title: t('dashboard.actionTitle'),
            count: t(`dashboard.actionCount.${pluralForm(actionTotal, locale)}`, {
              count: number.format(actionTotal),
            }),
            summary: t(`dashboard.actionSummary.${pluralForm(actionTotal, locale)}`, {
              count: number.format(actionTotal),
            }),
            caption: t('dashboard.actionCaption'),
            type: t('dashboard.colType'),
            employee: t('dashboard.colEmployee'),
            needed: t('dashboard.colNeeded'),
            waiting: t('dashboard.colWaiting'),
            overdue: t('dashboard.overdue'),
            showing: t('dashboard.showing', {
              shown: number.format(actions.length),
              total: number.format(actionTotal),
            }),
            seeAll: t('dashboard.seeAllDrafts'),
          }}
        />
      )}

      <ul
        aria-label={t('dashboard.cards.label')}
        className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]"
      >
        {kpiCards(summary, group, locale, t).map((card) => (
          <li key={card.label}>
            <StatCard {...card} />
          </li>
        ))}
      </ul>

      <Card className="mt-6">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <ToggleGroup
            as={Link}
            label={t('dashboard.views')}
            items={[
              {
                href: dashboardHref(state, { view: 'requests', requestId: undefined }),
                label: t('dashboard.byRequest'),
                count: summary.requests,
                active: state.view === 'requests',
              },
              {
                href: dashboardHref(state, { view: 'employees', requestId: undefined }),
                label: t('dashboard.byEmployee'),
                count: summary.employees,
                active: state.view === 'employees',
              },
            ]}
          />
          <DashboardFilters
            hidden={{
              ...(state.view === 'employees' ? { view: 'employees' } : {}),
              ...(state.requestId === undefined ? {} : { request: state.requestId }),
              ...(state.pageSize === PAGE_SIZES[0] ? {} : { size: String(state.pageSize) }),
            }}
            search={state.search ?? ''}
            selects={[
              {
                name: 'cycle',
                label: t('dashboard.period'),
                value: filter.cycleId ?? ALL_PERIODS,
                options: periodOptions(openList, locale, t),
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
          {list.view === 'requests' || state.requestId === undefined ? null : (
            <p className="flex flex-wrap items-center gap-3 text-sm text-ink">
              {list.data.items[0] === undefined
                ? t('dashboard.requestFilterGeneric')
                : t('dashboard.requestFilter', {
                    reference: list.data.items[0].request.reference,
                  })}
              <Link
                href={dashboardHref(state, { requestId: undefined })}
                className="text-sm font-medium text-brand-600 underline-offset-2 hover:underline"
              >
                {t('dashboard.clearRequestFilter')}
              </Link>
            </p>
          )}

          {total === 0 ? (
            filtered || state.requestId !== undefined ? (
              <EmptyState
                icon="search"
                title={t('dashboard.noMatchTitle')}
                description={t('dashboard.noMatchBody')}
                action={
                  <ButtonLink
                    href={dashboardHref(state, {
                      search: undefined,
                      status: undefined,
                      requestId: undefined,
                    })}
                    variant="secondary"
                    size="sm"
                    as={Link}
                  >
                    {t('dashboard.clearFilters')}
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                title={t('dashboard.emptyTitle')}
                description={t(preparer ? 'dashboard.emptyBody' : 'dashboard.emptyGroupBody')}
                action={
                  preparer ? (
                    <ButtonLink href="/requests/new" icon="plus" size="sm" as={Link}>
                      {t('dashboard.newRequest')}
                    </ButtonLink>
                  ) : undefined
                }
              />
            )
          ) : list.view === 'requests' ? (
            <RequestsTable
              rows={requestRows(list.data, state, now, locale, t, group)}
              showSubsidiary={group}
              labels={{
                caption: t('dashboard.requestsCaption'),
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
          ) : (
            <EmployeesTable
              rows={lineRows(list.data, locale, t, group)}
              showSubsidiary={group}
              labels={{
                caption: t('dashboard.employeesCaption'),
                employee: t('dashboard.colEmployee'),
                subsidiary: t('dashboard.colSubsidiary'),
                proposed: t('dashboard.colProposed'),
                criteria: t('dashboard.colCriteria'),
                status: t('dashboard.colEmployeeStatus'),
                updated: t('dashboard.colUpdated'),
                action: t('dashboard.colAction'),
                viewStatus: t('dashboard.viewStatus'),
                stateLabels: markStateLabels(t),
              }}
            />
          )}

          {total === 0 ? null : (
            <Pagination
              page={state.page}
              pageCount={pages}
              hrefFor={(target) => dashboardHref(state, { page: target })}
              as={Link}
              labels={paginationLabels('dashboard', state.page, pages, locale, t)}
              pageSize={
                <LinkSelect
                  label={t('dashboard.rowsPerPage')}
                  value={String(state.pageSize)}
                  options={PAGE_SIZES.map((size) => ({
                    value: String(size),
                    label: number.format(size),
                    href: dashboardHref(state, { pageSize: size }),
                  }))}
                />
              }
            />
          )}
        </div>
      </Card>
    </>
  );
}
