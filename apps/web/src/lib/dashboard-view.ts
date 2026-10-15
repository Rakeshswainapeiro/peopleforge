import {
  PAGE_SIZES,
  RequestStatusSchema,
  SearchTextSchema,
  type Cycle,
  type DashboardSummary,
  type IncrementRequestPage,
  type RequestLinePage,
  type RequestStage,
  type RequestStatus,
} from '@peopleforge/contracts';
import type { CriterionState, StageMeterProps, StatCardProps } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type { Translate } from '@/i18n/translator';
import { formatAge, formatDate, formatPercent } from './format';
import { employeesAdded } from './request-view';
import { statusBadge, type StatusBadgeView } from './request-status';
import { localised } from './viewer-display';

/**
 * "My increment requests" (R1-10, DASH-D1): the page's state lives in the URL (shareable, back
 * button, works without JavaScript), and these helpers turn API data into labelled rows.
 */

export type DashboardView = 'requests' | 'employees';

/** The Period value meaning "every cycle". */
export const ALL_PERIODS = 'all';

export interface DashboardState {
  view: DashboardView;
  /** A cycle ID, ALL_PERIODS, or undefined for the default: the first open cycle. */
  cycle?: string | undefined;
  status?: RequestStatus | undefined;
  search?: string | undefined;
  /** By employee only: one request's employees. */
  requestId?: string | undefined;
  page: number;
  pageSize: number;
}

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const Id = z.uuid();
const PageNumber = z.coerce.number().int().min(1).max(10_000);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads the dashboard's URL. Anything unrecognised falls back to its default rather than
 * failing: it is a link someone may have edited, not an API call.
 */
export function dashboardState(params: SearchParams): DashboardState {
  const view: DashboardView = first(params.view) === 'employees' ? 'employees' : 'requests';
  const cycle = first(params.cycle);
  const status = RequestStatusSchema.safeParse(first(params.status));
  const search = SearchTextSchema.safeParse(first(params.q));
  const request = Id.safeParse(first(params.request));
  const page = PageNumber.safeParse(first(params.page));
  const size = Number(first(params.size));
  return {
    view,
    cycle: cycle === ALL_PERIODS || Id.safeParse(cycle).success ? cycle : undefined,
    status: status.success ? status.data : undefined,
    search: search.success ? search.data : undefined,
    requestId: view === 'employees' && request.success ? request.data : undefined,
    page: page.success ? page.data : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZES[0],
  };
}

/**
 * A dashboard link: the current state with some changes. Any change goes back to page 1 unless
 * it sets the page; defaults are left out so links stay short.
 */
export function dashboardHref(
  state: DashboardState,
  changes: Partial<DashboardState> = {},
): string {
  const next = { ...state, page: 1, ...changes };
  const query = new URLSearchParams();
  if (next.view === 'employees') query.set('view', 'employees');
  if (next.cycle !== undefined) query.set('cycle', next.cycle);
  if (next.status !== undefined) query.set('status', next.status);
  if (next.search !== undefined) query.set('q', next.search);
  if (next.view === 'employees' && next.requestId !== undefined) {
    query.set('request', next.requestId);
  }
  if (next.page > 1) query.set('page', String(next.page));
  if (next.pageSize !== PAGE_SIZES[0]) query.set('size', String(next.pageSize));
  const search = query.toString();
  return search === '' ? '/' : `/?${search}`;
}

/** The cycle to filter by: the chosen one, none for "All periods", else the first open cycle. */
export function cycleFilter(
  state: DashboardState,
  openCycles: readonly Cycle[],
): string | undefined {
  if (state.cycle === ALL_PERIODS) return undefined;
  return state.cycle ?? openCycles[0]?.id;
}

export interface Option {
  value: string;
  label: string;
}

/** Period choices: the open cycles, then "All periods". */
export function periodOptions(cycles: readonly Cycle[], locale: Locale, t: Translate): Option[] {
  return [
    ...cycles.map((cycle) => ({ value: cycle.id, label: localised(cycle.name, locale) })),
    { value: ALL_PERIODS, label: t('dashboard.allPeriods') },
  ];
}

/** Status choices: "All statuses" (empty value), then each status. */
export function statusOptions(t: Translate): Option[] {
  return [
    { value: '', label: t('dashboard.allStatuses') },
    ...RequestStatusSchema.options.map((status) => ({
      value: status,
      label: statusBadge(status, t).label,
    })),
  ];
}

/**
 * Figma KPI cards. Sirius HR never sees drafts, so it gets no Drafts card. Replies, approvals
 * and rejections arrive with S5 and count zero until then.
 */
export function kpiCards(
  summary: DashboardSummary,
  group: boolean,
  locale: Locale,
  t: Translate,
): StatCardProps[] {
  const number = new Intl.NumberFormat(locale);
  const zero = number.format(0);
  const cards: StatCardProps[] = [
    {
      label: t('dashboard.cards.withSirius'),
      value: number.format(summary.byStatus.submitted),
      hint: t('dashboard.cards.withSiriusHint'),
    },
    {
      label: t('dashboard.cards.needsReply'),
      value: zero,
      hint: t('dashboard.cards.needsReplyHint'),
    },
    {
      label: t('dashboard.cards.approved'),
      value: zero,
      hint: t('dashboard.cards.approvedHint', { full: zero, partly: zero }),
    },
    { label: t('dashboard.cards.rejected'), value: zero, hint: t('dashboard.cards.rejectedHint') },
  ];
  return group
    ? cards
    : [
        {
          label: t('dashboard.cards.drafts'),
          value: number.format(summary.byStatus.draft),
          hint: t('dashboard.cards.draftsHint'),
        },
        ...cards,
      ];
}

/** "Not submitted" with an empty bar, or "Criterion 1 of 5" with one segment filled. */
export function stageView(stage: RequestStage, locale: Locale, t: Translate): StageMeterProps {
  const number = new Intl.NumberFormat(locale);
  if (stage.kind === 'not_submitted') {
    return { filled: 0, total: stage.of, label: t('dashboard.stageNotSubmitted') };
  }
  return {
    filled: stage.criterion,
    total: stage.of,
    label: t('dashboard.stageCriterion', {
      criterion: number.format(stage.criterion),
      of: number.format(stage.of),
    }),
  };
}

export interface RequestRowView {
  id: string;
  reference: string;
  href: string;
  entityCode: string;
  created: string;
  employees: string;
  employeesHref: string;
  employeesLabel: string;
  stage: StageMeterProps;
  status: StatusBadgeView;
  age: string;
  /** Who has it now: "You" for a draft, "Sirius HR" once submitted. */
  with: string;
}

export function requestRows(
  page: IncrementRequestPage,
  state: DashboardState,
  now: Date,
  locale: Locale,
  t: Translate,
): RequestRowView[] {
  const number = new Intl.NumberFormat(locale);
  return page.items.map((item) => ({
    id: item.id,
    reference: item.reference,
    href: `/requests/${item.id}`,
    entityCode: item.entity.code,
    created: formatDate(item.createdAt, locale),
    employees: number.format(item.employeeCount),
    employeesHref: dashboardHref(state, { view: 'employees', requestId: item.id }),
    employeesLabel: t('dashboard.viewEmployeesOf', { reference: item.reference }),
    stage: stageView(item.stage, locale, t),
    status: statusBadge(item.status, t),
    age: formatAge(item.statusChangedAt, now, locale),
    with: item.status === 'draft' ? t('dashboard.withYou') : t('dashboard.withSirius'),
  }));
}

export interface LineRowView {
  id: string;
  href: string;
  name: string;
  detail: string;
  entityCode: string;
  proposed: string;
  marks: { code: string; state: CriterionState }[];
  /** "C1 pass, C2 not complete, …" for screen readers. */
  marksLabel: string;
  status: StatusBadgeView;
  updated: string;
  viewLabel: string;
}

export function lineRows(page: RequestLinePage, locale: Locale, t: Translate): LineRowView[] {
  return page.items.map((line) => ({
    id: line.id,
    href: `/requests/${line.request.id}/employees/${line.id}`,
    name: line.fullName,
    detail: t('dashboard.employeeLine', {
      number: line.employeeNumber,
      grade: line.grade,
      reference: line.request.reference,
    }),
    entityCode: line.request.entityCode,
    proposed:
      line.proposedPercent === null
        ? t('dashboard.notProposed')
        : formatPercent(line.proposedPercent, locale),
    marks: line.criteria.map((criterion) => ({ code: criterion.code, state: criterion.mark })),
    marksLabel: line.criteria
      .map((criterion) =>
        t('dashboard.criterionMark', {
          code: criterion.code,
          state: t(`dashboard.markStates.${criterion.mark}`),
        }),
      )
      .join(', '),
    status: statusBadge(line.status, t),
    updated: formatDate(line.updatedAt, locale),
    viewLabel: t('dashboard.viewStatusOf', { name: line.fullName }),
  }));
}

export interface DraftActionView {
  id: string;
  title: string;
  detail: string;
  href: string;
}

/** Figma "Needs your action": each draft with how far its criteria have got. */
export function draftActions(
  page: IncrementRequestPage,
  locale: Locale,
  t: Translate,
): DraftActionView[] {
  const number = new Intl.NumberFormat(locale);
  return page.items.map((draft) => ({
    id: draft.id,
    title: t('dashboard.draftNotSubmitted', { reference: draft.reference }),
    detail: t('dashboard.draftProgress', {
      employees: employeesAdded(draft.employeeCount, locale, t),
      complete: number.format(draft.criteria.complete),
      total: number.format(draft.criteria.total),
    }),
    href: `/requests/${draft.id}`,
  }));
}
