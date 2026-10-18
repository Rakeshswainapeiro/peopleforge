import type { AnalyticsQuery } from '@peopleforge/contracts';
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  ToggleGroup,
} from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MeasureTable } from '@/components/analytics/measure-table';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import {
  ANALYTICS_PATH,
  analyticsHref,
  analyticsState,
  flowCards,
  flowTables,
  rp02Href,
  tatCards,
  tatTables,
} from '@/lib/analytics-view';
import {
  ALL_PERIODS,
  cycleFilter,
  entityOptions,
  periodOptions,
  type SearchParams,
} from '@/lib/dashboard-view';
import { roleLabel } from '@/lib/viewer-display';
import type { ApiResult } from '@/server/api-client';
import { getIncrementAnalytics } from '@/server/analytics';
import { openCycles } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';

interface AnalyticsPageProps {
  searchParams?: Promise<SearchParams>;
}

function required<T>(result: ApiResult<T>): T {
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind !== 'ok') throw new Error('Analytics API unavailable');
  return result.data;
}

/**
 * Analytics for Sirius HR (R1-11, R1-12; DASH-D3 TAT, DASH-D4 back-and-forth) by period and
 * subsidiary, with RP-02 as Excel. No Figma frame (M6): built from the design system.
 */
export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  // Comparing subsidiaries is for Sirius HR: group scope with operational reports.
  if (me.scope !== 'group' || !me.permissions.includes('report:read_operational')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const state = analyticsState((await searchParams) ?? {});
  const cycles = required(await openCycles());
  const cycleId = cycleFilter(state, cycles);
  const query: AnalyticsQuery = {
    ...(cycleId === undefined ? {} : { cycleId }),
    ...(state.entity === undefined ? {} : { entityId: state.entity }),
  };
  const data = required(await getIncrementAnalytics(query));
  const flow = state.view === 'flow';
  const cards = flow ? flowCards(data, locale, t) : tatCards(data, locale, t);

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('analytics.heading')}
        description={t('analytics.intro')}
        actions={
          <ButtonLink href={rp02Href(query)} icon="download" variant="outline">
            {t('analytics.download')}
          </ButtonLink>
        }
      />
      <p className="mt-2 text-xs text-ink-muted">{t('analytics.logged')}</p>
      <Card className="mt-6">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <ToggleGroup
            as={Link}
            label={t('analytics.views')}
            items={[
              {
                href: analyticsHref(state, { view: 'tat' }),
                label: t('analytics.viewTat'),
                active: !flow,
              },
              {
                href: analyticsHref(state, { view: 'flow' }),
                label: t('analytics.viewFlow'),
                active: flow,
              },
            ]}
          />
          <DashboardFilters
            path={ANALYTICS_PATH}
            hidden={flow ? { view: 'flow' } : {}}
            selects={[
              {
                name: 'cycle',
                label: t('dashboard.period'),
                value: query.cycleId ?? ALL_PERIODS,
                options: periodOptions(cycles, locale, t),
              },
              {
                name: 'entity',
                label: t('dashboard.subsidiary'),
                value: state.entity ?? '',
                options: entityOptions(me.entities, t),
              },
            ]}
            labels={{
              filters: t('analytics.filters'),
              search: t('dashboard.search'),
              searchPlaceholder: t('dashboard.searchPlaceholder'),
              applySearch: t('dashboard.applySearch'),
            }}
          />
        </div>
      </Card>

      {data.tat.requests === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon="trend"
            title={t('analytics.emptyTitle')}
            description={t('analytics.emptyBody')}
          />
        </Card>
      ) : (
        <>
          <ul
            aria-label={t('analytics.cards.label')}
            className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]"
          >
            {cards.map((card) => (
              <li key={card.label}>
                <StatCard {...card} />
              </li>
            ))}
          </ul>
          {flow ? (
            <FlowSections data={flowTables(data, locale, t)} empty={t('analytics.emptyFlow')} />
          ) : (
            <TatSections
              data={tatTables(data, locale, t)}
              criteriaIntro={t('analytics.criteriaIntro')}
              emptyCriteria={t('analytics.emptyCriteria')}
            />
          )}
        </>
      )}
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mt-6" label={title}>
      <CardHeader title={title} description={description} />
      <div className="px-4 pt-2 pb-6 sm:px-6">{children}</div>
    </Card>
  );
}

function TatSections({
  data,
  criteriaIntro,
  emptyCriteria,
}: {
  data: ReturnType<typeof tatTables>;
  criteriaIntro: string;
  emptyCriteria: string;
}) {
  return (
    <>
      <Section title={data.criteria.caption} description={criteriaIntro}>
        {data.criteria.rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{emptyCriteria}</p>
        ) : (
          <MeasureTable table={data.criteria} />
        )}
      </Section>
      <Section title={data.entities.caption}>
        <MeasureTable table={data.entities} />
      </Section>
      <Section title={data.requests.caption}>
        <MeasureTable table={data.requests} />
      </Section>
    </>
  );
}

function FlowSections({ data, empty }: { data: ReturnType<typeof flowTables>; empty: string }) {
  return (
    <>
      <Section title={data.entities.caption}>
        <MeasureTable table={data.entities} />
      </Section>
      <Section title={data.requests.caption}>
        {data.requests.rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{empty}</p>
        ) : (
          <MeasureTable table={data.requests} />
        )}
      </Section>
    </>
  );
}
