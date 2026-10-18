import type { AnalyticsQuery, IncrementAnalytics } from '@peopleforge/contracts';
import type { StatCardProps } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type { Translate } from '@/i18n/translator';
import { ALL_PERIODS, dashboardState, type SearchParams } from './dashboard-view';
import { formatDate } from './format';
import { statusBadge } from './request-status';

/**
 * Analytics (R1-11, R1-12; DASH-D3, DASH-D4) for Sirius HR: the page's state in the URL, the
 * RP-02 link with the same filters, and the API's measures in words.
 */

export const ANALYTICS_PATH = '/analytics';
export const RP02_PATH = '/analytics/rp-02';

export type AnalyticsView = 'tat' | 'flow';

export interface AnalyticsState {
  view: AnalyticsView;
  /** A cycle ID, ALL_PERIODS, or undefined for the first open cycle. */
  cycle?: string | undefined;
  entity?: string | undefined;
}

export function analyticsState(params: SearchParams): AnalyticsState {
  const { cycle, entity } = dashboardState(params);
  return { view: params.view === 'flow' ? 'flow' : 'tat', cycle, entity };
}

/** A link to the page; the filters travel with it. */
export function analyticsHref(state: AnalyticsState, change: Partial<AnalyticsState> = {}): string {
  const next = { ...state, ...change };
  const query = new URLSearchParams();
  if (next.view === 'flow') query.set('view', 'flow');
  if (next.cycle !== undefined) query.set('cycle', next.cycle);
  if (next.entity !== undefined) query.set('entity', next.entity);
  const search = query.toString();
  return search === '' ? ANALYTICS_PATH : `${ANALYTICS_PATH}?${search}`;
}

/** The RP-02 download for these filters, with the period resolved (as on screen). */
export function rp02Href(filter: AnalyticsQuery): string {
  const query = new URLSearchParams({ cycle: filter.cycleId ?? ALL_PERIODS });
  if (filter.entityId !== undefined) query.set('entity', filter.entityId);
  return `${RP02_PATH}?${query.toString()}`;
}

const Id = z.uuid();

/** Reads the download link back (anything malformed is dropped: all periods, every subsidiary). */
export function rp02Query(params: Readonly<Record<string, string>>): AnalyticsQuery {
  const cycle = Id.safeParse(params.cycle);
  const entity = Id.safeParse(params.entity);
  return {
    ...(cycle.success ? { cycleId: cycle.data } : {}),
    ...(entity.success ? { entityId: entity.data } : {}),
  };
}

/** "2.5 days", in the reader's digits; "—" for nothing measured. */
export function daysText(value: string | null, locale: Locale, t: Translate): string {
  if (value === null) return t('analytics.none');
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return t('analytics.days', { days: number.format(Number(value)) });
}

export function tatCards(data: IncrementAnalytics, locale: Locale, t: Translate): StatCardProps[] {
  const number = new Intl.NumberFormat(locale);
  const longest = data.tat.longestOpen;
  return [
    {
      label: t('analytics.cards.averageTat'),
      value: daysText(data.tat.averageDays, locale, t),
      hint: t('analytics.cards.averageTatHint', { count: number.format(data.tat.decided) }),
    },
    {
      label: t('analytics.cards.openAge'),
      value: number.format(data.tat.open),
      hint: t('analytics.cards.openAgeHint', {
        days: daysText(data.tat.openAverageDays, locale, t),
      }),
    },
    {
      label: t('analytics.cards.longest'),
      value: longest === null ? t('analytics.none') : daysText(longest.days, locale, t),
      hint:
        longest === null
          ? t('analytics.cards.longestNone')
          : t('analytics.cards.longestHint', {
              reference: longest.reference,
              entity: longest.entityCode,
            }),
    },
  ];
}

export function flowCards(data: IncrementAnalytics, locale: Locale, t: Translate): StatCardProps[] {
  const number = new Intl.NumberFormat(locale);
  const flow = data.backAndForth;
  return [
    {
      label: t('analytics.cards.returns'),
      value: number.format(flow.returns),
      hint: t('analytics.cards.returnsHint', { count: number.format(flow.openReturns) }),
    },
    {
      label: t('analytics.cards.averageReturn'),
      value: daysText(flow.averageReturnDays, locale, t),
      hint: t('analytics.cards.averageReturnHint'),
    },
    {
      label: t('analytics.cards.questions'),
      value: number.format(flow.questions),
    },
    {
      label: t('analytics.cards.averageAnswer'),
      value: daysText(flow.averageAnswerDays, locale, t),
      hint: t('analytics.cards.averageAnswerHint'),
    },
  ];
}

/** A table: column headers and rows of cells, already in words. */
export interface TableView {
  caption: string;
  headers: string[];
  rows: { id: string; cells: string[] }[];
}

export function tatTables(
  data: IncrementAnalytics,
  locale: Locale,
  t: Translate,
): { criteria: TableView; entities: TableView; requests: TableView } {
  const number = new Intl.NumberFormat(locale);
  const d = (value: string | null) => daysText(value, locale, t);
  return {
    criteria: {
      caption: t('analytics.criteriaTitle'),
      headers: [
        t('analytics.col.criterion'),
        t('analytics.col.verified'),
        t('analytics.col.average'),
        t('analytics.col.longest'),
      ],
      rows: data.tat.byCriterion.map((row) => ({
        id: row.code,
        cells: [row.code, number.format(row.verified), d(row.averageDays), d(row.maxDays)],
      })),
    },
    entities: {
      caption: t('analytics.entitiesTitle'),
      headers: [
        t('analytics.col.subsidiary'),
        t('analytics.col.requests'),
        t('analytics.col.decided'),
        t('analytics.col.averageTat'),
        t('analytics.col.openAverage'),
      ],
      rows: data.tat.byEntity.map((row) => ({
        id: row.entityCode,
        cells: [
          row.entityCode,
          number.format(row.requests),
          number.format(row.decided),
          d(row.averageDays),
          d(row.openAverageDays),
        ],
      })),
    },
    requests: {
      caption: t('analytics.requestsTitle'),
      headers: [
        t('analytics.col.request'),
        t('analytics.col.subsidiary'),
        t('analytics.col.status'),
        t('analytics.col.submitted'),
        t('analytics.col.tat'),
      ],
      rows: data.tat.byRequest.map((row) => ({
        id: row.id,
        cells: [
          row.reference,
          row.entityCode,
          statusBadge(row.status, t).label,
          formatDate(row.submittedAt, locale),
          row.open ? `${d(row.days)} · ${t('analytics.open')}` : d(row.days),
        ],
      })),
    },
  };
}

export function flowTables(
  data: IncrementAnalytics,
  locale: Locale,
  t: Translate,
): { entities: TableView; requests: TableView } {
  const number = new Intl.NumberFormat(locale);
  const d = (value: string | null) => daysText(value, locale, t);
  return {
    entities: {
      caption: t('analytics.entitiesTitle'),
      headers: [
        t('analytics.col.subsidiary'),
        t('analytics.col.requests'),
        t('analytics.col.returns'),
        t('analytics.col.averageReturn'),
        t('analytics.col.questions'),
        t('analytics.col.averageAnswer'),
      ],
      rows: data.backAndForth.byEntity.map((row) => ({
        id: row.entityCode,
        cells: [
          row.entityCode,
          number.format(row.requests),
          number.format(row.returns),
          d(row.averageReturnDays),
          number.format(row.questions),
          d(row.averageAnswerDays),
        ],
      })),
    },
    requests: {
      caption: t('analytics.flowRequestsTitle'),
      headers: [
        t('analytics.col.request'),
        t('analytics.col.subsidiary'),
        t('analytics.col.status'),
        t('analytics.col.returns'),
        t('analytics.col.openReturns'),
        t('analytics.col.daysWithSubsidiary'),
        t('analytics.col.questions'),
        t('analytics.col.answers'),
        t('analytics.col.averageAnswer'),
      ],
      rows: data.backAndForth.byRequest.map((row) => ({
        id: row.id,
        cells: [
          row.reference,
          row.entityCode,
          statusBadge(row.status, t).label,
          number.format(row.returns),
          number.format(row.openReturns),
          d(row.daysWithSubsidiary),
          number.format(row.questions),
          number.format(row.answers),
          d(row.averageAnswerDays),
        ],
      })),
    },
  };
}
