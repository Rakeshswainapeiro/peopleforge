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
import type { BadgeTone, CriterionState, StageMeterProps, StatCardProps } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type { Translate } from '@/i18n/translator';
import { daysBetween, formatAge, formatDate, formatPercent } from './format';
import { pluralForm } from '@peopleforge/i18n';
import { employeeBadge, statusBadge, type StatusBadgeView } from './request-status';
import { localised } from './viewer-display';
import { editRequestHref, employeeStatusHref, requestLinkFor } from './routes';

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
  /** One subsidiary (Sirius HR's Request Tracker). */
  entity?: string | undefined;
  status?: RequestStatus | undefined;
  search?: string | undefined;
  /** By employee only: one request's employees. */
  requestId?: string | undefined;
  page: number;
  pageSize: number;
  /** What "Needs your action" shows. */
  show?: ActionFilter | undefined;
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
  const entity = Id.safeParse(first(params.entity));
  const show = first(params.show);
  const page = PageNumber.safeParse(first(params.page));
  const size = Number(first(params.size));
  return {
    view,
    cycle: cycle === ALL_PERIODS || Id.safeParse(cycle).success ? cycle : undefined,
    entity: entity.success ? entity.data : undefined,
    status: status.success ? status.data : undefined,
    search: search.success ? search.data : undefined,
    requestId: view === 'employees' && request.success ? request.data : undefined,
    page: page.success ? page.data : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZES[0],
    show: show === 'drafts' || show === 'returned' ? show : undefined,
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
  if (next.entity !== undefined) query.set('entity', next.entity);
  if (next.status !== undefined) query.set('status', next.status);
  if (next.search !== undefined) query.set('q', next.search);
  if (next.view === 'employees' && next.requestId !== undefined) {
    query.set('request', next.requestId);
  }
  if (next.page > 1) query.set('page', String(next.page));
  if (next.pageSize !== PAGE_SIZES[0]) query.set('size', String(next.pageSize));
  if (next.show !== undefined) query.set('show', next.show);
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

/** Status choices: "All statuses" (empty value), then each status (no drafts for Sirius HR). */
export function statusOptions(t: Translate, group = false): Option[] {
  return [
    { value: '', label: t('dashboard.allStatuses') },
    ...RequestStatusSchema.options
      .filter((status) => !group || status !== 'draft')
      .map((status) => ({ value: status, label: statusBadge(status, t).label })),
  ];
}

/** Subsidiary choices for Sirius HR: "All subsidiaries" (empty value), then each by code. */
export function entityOptions(
  entities: readonly { id: string; code: string }[],
  t: Translate,
): Option[] {
  return [
    { value: '', label: t('dashboard.allSubsidiaries') },
    ...entities.map((entity) => ({ value: entity.id, label: entity.code })),
  ];
}

/**
 * Figma KPI cards. Subsidiary HR: drafts, with Sirius HR, needing their reply, approved (full and
 * partly), rejected. Sirius HR never sees drafts: to review, returned, approved, rejected.
 */
export function kpiCards(
  summary: DashboardSummary,
  group: boolean,
  locale: Locale,
  t: Translate,
): StatCardProps[] {
  const number = new Intl.NumberFormat(locale);
  const counts = summary.byStatus;
  const withSirius = number.format(counts.submitted + counts.under_review);
  const decided: StatCardProps[] = [
    {
      label: t('dashboard.cards.approved'),
      value: number.format(counts.approved + counts.partly_approved),
      hint: t('dashboard.cards.approvedHint', {
        full: number.format(counts.approved),
        partly: number.format(counts.partly_approved),
      }),
    },
    {
      label: t('dashboard.cards.rejected'),
      value: number.format(counts.rejected),
      hint: t('dashboard.cards.rejectedHint'),
    },
  ];
  if (group) {
    return [
      {
        label: t('dashboard.cards.withSiriusGroup'),
        value: withSirius,
        hint: t('dashboard.cards.withSiriusGroupHint'),
      },
      {
        label: t('dashboard.cards.needsReplyGroup'),
        value: number.format(counts.returned),
        hint: t('dashboard.cards.needsReplyGroupHint'),
      },
      ...decided,
    ];
  }
  return [
    {
      label: t('dashboard.cards.drafts'),
      value: number.format(counts.draft),
      hint: t('dashboard.cards.draftsHint'),
    },
    {
      label: t('dashboard.cards.withSirius'),
      value: withSirius,
      hint: t('dashboard.cards.withSiriusHint'),
    },
    {
      label: t('dashboard.cards.needsReply'),
      value: number.format(counts.returned),
      hint: t('dashboard.cards.needsReplyHint'),
    },
    ...decided,
  ];
}

/**
 * The review stage as a bar (R1-10): "Not submitted" empty, "Criterion 3 of 5" with three
 * segments, "Awaiting decision" and "Decided" full.
 */
export function stageView(stage: RequestStage, locale: Locale, t: Translate): StageMeterProps {
  const number = new Intl.NumberFormat(locale);
  switch (stage.kind) {
    case 'not_submitted':
      return { filled: 0, total: stage.of, label: t('dashboard.stageNotSubmitted') };
    case 'criterion':
      return {
        filled: stage.criterion,
        total: stage.of,
        label: t('dashboard.stageCriterion', {
          criterion: number.format(stage.criterion),
          of: number.format(stage.of),
        }),
      };
    case 'decision':
      return { filled: stage.of, total: stage.of, label: t('dashboard.stageDecision') };
    case 'decided':
      return { filled: stage.of, total: stage.of, label: t('dashboard.stageDecided') };
  }
}

/**
 * Who has a request now (Figma "With"): the subsidiary for a draft or a return ("You" for its
 * own HR), Sirius HR while in review, nobody once decided.
 */
export function withWhom(
  status: RequestStatus,
  entityCode: string,
  group: boolean,
  t: Translate,
): string {
  switch (status) {
    case 'draft':
    case 'returned':
      return group ? t('dashboard.withSubsidiary', { entity: entityCode }) : t('dashboard.withYou');
    case 'submitted':
    case 'under_review':
      return t('dashboard.withSirius');
    case 'approved':
    case 'partly_approved':
    case 'rejected':
      return t('dashboard.withNobody');
  }
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
  /** Who has it now (see `withWhom`). */
  with: string;
  /** When it went to Sirius HR; "—" for a draft. */
  submitted: string;
}

export function requestRows(
  page: IncrementRequestPage,
  state: DashboardState,
  now: Date,
  locale: Locale,
  t: Translate,
  group = false,
): RequestRowView[] {
  const number = new Intl.NumberFormat(locale);
  return page.items.map((item) => ({
    id: item.id,
    reference: item.reference,
    href: requestLinkFor(item.id, item.status),
    entityCode: item.entity.code,
    created: formatDate(item.createdAt, locale),
    employees: number.format(item.employeeCount),
    employeesHref: dashboardHref(state, { view: 'employees', requestId: item.id }),
    employeesLabel: t('dashboard.viewEmployeesOf', { reference: item.reference }),
    stage: stageView(item.stage, locale, t),
    status: statusBadge(item.status, t),
    age: formatAge(item.statusChangedAt, now, locale),
    with: withWhom(item.status, item.entity.code, group, t),
    submitted: item.submittedAt === null ? '—' : formatDate(item.submittedAt, locale),
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

export function lineRows(
  page: RequestLinePage,
  locale: Locale,
  t: Translate,
  group = false,
): LineRowView[] {
  return page.items.map((line) => ({
    id: line.id,
    href: employeeStatusHref(line.request.id, line.id),
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
    status: employeeBadge(line.request.status, line.reviewStatus, group, t),
    updated: formatDate(line.updatedAt, locale),
    viewLabel: t('dashboard.viewStatusOf', { name: line.fullName }),
  }));
}

/** After how many days waiting an item is highlighted (assumption until the designer confirms). */
export const ACTION_OVERDUE_DAYS = 5;

/** How many items "Needs your action" lists before "See all" (Figma: 5). */
export const ACTION_ROWS = 5;

/** The "Show" choices of "Needs your action": everything, drafts, or returns to answer. */
export type ActionFilter = 'all' | 'drafts' | 'returned';

export interface ActionRowView {
  id: string;
  type: { tone: BadgeTone; label: string };
  /** "4 employees" over the request reference. */
  primary: string;
  secondary: string;
  needed: string;
  neededDetail: string;
  waiting: string;
  overdue: boolean;
  href: string;
  action: string;
}

/**
 * Figma "Needs your action" rows, longest waiting first: drafts to complete and submit, and
 * requests Sirius HR returned with a question (R1-08), with how long each has waited.
 */
export function actionRows(
  items: readonly IncrementRequestPage['items'][number][],
  now: Date,
  locale: Locale,
  t: Translate,
): ActionRowView[] {
  const number = new Intl.NumberFormat(locale);
  return [...items]
    .sort((a, b) => a.statusChangedAt.localeCompare(b.statusChangedAt))
    .slice(0, ACTION_ROWS)
    .map((item) => {
      const returned = item.status === 'returned';
      return {
        id: item.id,
        type: returned
          ? { tone: 'warning', label: t('dashboard.typeReturned') }
          : { tone: 'outline', label: t('dashboard.typeDraft') },
        primary: t(`figures.employeeCount.${pluralForm(item.employeeCount, locale)}`, {
          count: number.format(item.employeeCount),
        }),
        secondary: item.reference,
        needed: returned ? t('dashboard.needsReply') : t('dashboard.needsSubmit'),
        neededDetail: returned
          ? stageView(item.stage, locale, t).label
          : t('dashboard.needsCriteria', {
              complete: number.format(item.criteria.complete),
              total: number.format(item.criteria.total),
            }),
        waiting: formatAge(item.statusChangedAt, now, locale),
        overdue: daysBetween(item.statusChangedAt, now) >= ACTION_OVERDUE_DAYS,
        href: editRequestHref(item.id),
        action: returned ? t('dashboard.respond') : t('dashboard.continueDraft'),
      };
    });
}
