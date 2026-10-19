import { FLAG_STATUSES } from '@peopleforge/contracts';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Pagination,
  StatCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashboardFilters } from '@/components/dashboard/dashboard-filters';
import { EntityBars, FlagsTable } from '@/components/group/group-tables';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatAge } from '@/lib/format';
import {
  comparisonItems,
  entityChoices,
  flagBadge,
  flagFill,
  flagSubject,
  flagHref,
  flagsHref,
  flagsState,
  formatPeriod,
  GROUP_QUALITY_PATH,
  periodOptions,
  ruleName,
  uploadHref,
  type SearchParams,
} from '@/lib/group-view';
import { pageCount, paginationLabels } from '@/lib/pagination';
import { roleLabel } from '@/lib/viewer-display';
import { listFlags, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface QualityPageProps {
  searchParams?: Promise<SearchParams>;
}

/** A count by status, without indexing an object by a variable. */
function countOf(
  counts: { open: number; in_progress: number; resolved: number },
  status: (typeof FLAG_STATUSES)[number],
): number {
  return status === 'open'
    ? counts.open
    : status === 'in_progress'
      ? counts.in_progress
      : counts.resolved;
}

/**
 * Figma "Data quality & anomalies" (DASH-D7; R2-09 … R2-11): flags by status and subsidiary,
 * each subsidiary's month against the previous one, and the flags to work. Subsidiary HR see
 * their own (R2-12). Figma issue fixed: the variation table shows each subsidiary's own figures.
 */
export default async function QualityPage({ searchParams }: QualityPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:read')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const now = new Date();
  const state = flagsState((await searchParams) ?? {}, now);
  const data = required(
    await listFlags({
      period: state.period,
      entityId: state.entity,
      status: state.status,
      rule: state.rule,
      page: state.page,
    }),
  );
  const pages = pageCount(data.total, data.pageSize);
  if (data.total > 0 && state.page > pages) redirect(flagsHref(state, { page: pages }));
  const number = new Intl.NumberFormat(locale);
  const statusLabel = (status: (typeof FLAG_STATUSES)[number]) => flagBadge(status, t).label;

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('group.quality.heading')}
        description={
          state.period === undefined
            ? t('group.quality.introAll')
            : t('group.quality.intro', { period: formatPeriod(state.period, locale) })
        }
      />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={statusLabel('open')} value={number.format(data.counts.open)} />
        <StatCard
          label={statusLabel('in_progress')}
          value={number.format(data.counts.in_progress)}
        />
        <StatCard label={statusLabel('resolved')} value={number.format(data.counts.resolved)} />
        <StatCard
          label={t('group.quality.oldestOpen')}
          value={data.oldestOpenAt === null ? '—' : formatAge(data.oldestOpenAt, now, locale)}
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card label={t('group.quality.byEntity')}>
          <CardHeader title={t('group.quality.byEntity')} />
          <div className="px-4 pb-6 sm:px-6">
            {data.byEntity.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('group.quality.noFlags')}</p>
            ) : (
              <EntityBars
                label={t('group.quality.byEntity')}
                rows={data.byEntity.map((row) => ({
                  entity: row.entity.code,
                  total: row.counts.open + row.counts.in_progress + row.counts.resolved,
                  parts: FLAG_STATUSES.map((status) => ({
                    id: status,
                    label: statusLabel(status),
                    count: countOf(row.counts, status),
                    className: flagFill(status),
                  })),
                  text: FLAG_STATUSES.map(
                    (status) =>
                      `${statusLabel(status)} ${number.format(countOf(row.counts, status))}`,
                  ).join(' · '),
                }))}
              />
            )}
          </div>
        </Card>
        <Card label={t('group.quality.variations')}>
          <CardHeader
            title={t('group.quality.variations')}
            description={t('group.quality.variationsIntro')}
          />
          <div className="px-4 pb-4 sm:px-6">
            {data.variations.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {state.period === undefined
                  ? t('group.quality.chooseMonth')
                  : t('group.quality.noUploads')}
              </p>
            ) : (
              <Table caption={t('group.quality.variations')}>
                <THead>
                  <tr>
                    <Th>{t('group.subsidiary')}</Th>
                    {comparisonItems(
                      {
                        previousPeriod: null,
                        headcount: 0,
                        previousHeadcount: null,
                        payrollChangePercent: null,
                        newRecords: 0,
                        left: 0,
                        missing: 0,
                        changed: 0,
                        warnings: [],
                      },
                      locale,
                      t,
                    ).map((item) => (
                      <Th key={item.id}>{item.label}</Th>
                    ))}
                    <Th align="end">{t('group.uploads.colFlags')}</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.variations.map((row) => (
                    <Tr key={row.entity.id}>
                      <Td>
                        <Link
                          href={uploadHref(row.upload.id)}
                          className="font-semibold text-brand-600 hover:underline"
                        >
                          {row.entity.code}
                        </Link>
                        <span className="block text-xs text-ink-muted">
                          {t('group.versionNumber', { version: number.format(row.upload.version) })}
                        </span>
                      </Td>
                      {row.comparison === null ? (
                        <Td colSpan={6}>—</Td>
                      ) : (
                        comparisonItems(row.comparison, locale, t).map((item) => (
                          <Td key={item.id} className="tabular-nums">
                            {item.value}
                          </Td>
                        ))
                      )}
                      <Td className="text-end tabular-nums">{number.format(row.flags)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
      </div>
      <Card className="mt-6" label={t('group.quality.flagsTitle')}>
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <DashboardFilters
            path={GROUP_QUALITY_PATH}
            hidden={{}}
            selects={[
              {
                name: 'period',
                label: t('group.month'),
                value: state.period ?? 'all',
                options: [
                  { value: 'all', label: t('group.allMonths') },
                  ...periodOptions(now, locale),
                ],
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
                name: 'status',
                label: t('group.quality.status'),
                value: state.status ?? '',
                options: [
                  { value: '', label: t('group.quality.allStatuses') },
                  ...FLAG_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
                ],
              },
              {
                name: 'rule',
                label: t('group.quality.rule'),
                value: state.rule ?? '',
                options: [
                  { value: '', label: t('group.quality.allRules') },
                  ...data.rules.map(({ code, kind }) => ({
                    value: code,
                    label: `${code} · ${ruleName(kind, t)}`,
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
          {data.total === 0 ? (
            <EmptyState
              icon="flag"
              title={t('group.quality.emptyTitle')}
              description={t('group.quality.emptyBody')}
            />
          ) : (
            <>
              <FlagsTable
                rows={data.items.map((flag) => ({
                  id: flag.id,
                  reference: flag.reference,
                  rule: `${flag.ruleCode} · ${ruleName(flag.ruleKind, t)}`,
                  subject: flagSubject(flag, t),
                  entity: `${flag.entity.code} · ${formatPeriod(flag.period, locale)}`,
                  owner: flag.owner.name,
                  badge: flagBadge(flag.status, t),
                  age: formatAge(flag.createdAt, now, locale),
                  href: flagHref(flag.id),
                }))}
                labels={{
                  caption: t('group.quality.flagsTitle'),
                  flag: t('group.quality.colFlag'),
                  subject: t('group.quality.colSubject'),
                  subsidiary: t('group.quality.colSubsidiary'),
                  owner: t('group.quality.colOwner'),
                  status: t('group.quality.status'),
                  raised: t('group.quality.colRaised'),
                }}
              />
              {pages > 1 ? (
                <Pagination
                  page={state.page}
                  pageCount={pages}
                  hrefFor={(target) => flagsHref(state, { page: target })}
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
