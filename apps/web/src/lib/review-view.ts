import {
  ChangeReasonSchema,
  IN_REVIEW_STATUSES,
  PAGE_SIZES,
  RejectReasonSchema,
  ReturnReasonSchema,
  ReviewQueueFilterSchema,
  SearchTextSchema,
  type DecisionReason,
  type IncrementRequest,
  type RequestLine,
  type ReviewQueueFilter,
  type ReviewQueuePage,
} from '@peopleforge/contracts';
import type { AlertTone, CriterionState } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type {
  DecisionPanelLabels,
  DecisionTab,
  ReasonOption,
} from '@/components/review/decision-panel';
import type { Translate } from '@/i18n/translator';
import { pluralForm } from '@peopleforge/i18n';
import { stageView } from './dashboard-view';
import { formatAge, formatDate, formatDateTime, formatMoney, formatPercent } from './format';
import { reasonLabel } from './request-detail-view';
import { employeeBadge, type StatusBadgeView } from './request-status';
import { employeeStatusHref } from './routes';
import { entityName } from './viewer-display';

/**
 * Sirius HR's review (R1-07 … R1-10): the Review queue, the review of one employee (verifying
 * criteria, the decision panel) and the decision as everyone sees it afterwards.
 */

// Queue ------------------------------------------------------------------------------------

export interface QueueState {
  filter: ReviewQueueFilter;
  entity?: string | undefined;
  search?: string | undefined;
  page: number;
  pageSize: number;
}

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const Id = z.uuid();
const PageNumber = z.coerce.number().int().min(1).max(10_000);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the queue's URL; anything unrecognised falls back to its default. */
export function queueState(params: SearchParams): QueueState {
  const filter = ReviewQueueFilterSchema.safeParse(first(params.filter));
  const entity = Id.safeParse(first(params.entity));
  const search = SearchTextSchema.safeParse(first(params.q));
  const page = PageNumber.safeParse(first(params.page));
  const size = Number(first(params.size));
  return {
    filter: filter.success ? filter.data : 'pending',
    entity: entity.success ? entity.data : undefined,
    search: search.success ? search.data : undefined,
    page: page.success ? page.data : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZES[0],
  };
}

/** A queue link: the current state with some changes, back to page 1 unless it sets one. */
export function queueHref(state: QueueState, changes: Partial<QueueState> = {}): string {
  const next = { ...state, page: 1, ...changes };
  const query = new URLSearchParams();
  if (next.filter !== 'pending') query.set('filter', next.filter);
  if (next.entity !== undefined) query.set('entity', next.entity);
  if (next.search !== undefined) query.set('q', next.search);
  if (next.page > 1) query.set('page', String(next.page));
  if (next.pageSize !== PAGE_SIZES[0]) query.set('size', String(next.pageSize));
  const search = query.toString();
  return search === '' ? '/review' : `/review?${search}`;
}

export interface QueueChipView {
  filter: ReviewQueueFilter;
  label: string;
  count: number;
  href: string;
  active: boolean;
}

/** Figma chips: To review · Returned · Past reminder · All open · All, with their counts. */
export function queueChips(
  page: ReviewQueuePage,
  state: QueueState,
  t: Translate,
): QueueChipView[] {
  // Each chip's count, read by name rather than by a variable key.
  const { pending, returned, overdue, open, all } = page.counts;
  const counts = { pending, returned, overdue, open, all };
  return Object.entries(counts).map(([name, count]) => {
    const filter = ReviewQueueFilterSchema.parse(name);
    return {
      filter,
      label: t(`review.filters.${filter}`),
      count,
      href: queueHref(state, { filter }),
      active: state.filter === filter,
    };
  });
}

export interface QueueRowView {
  id: string;
  href: string;
  name: string;
  detail: string;
  request: string;
  entityCode: string;
  stage: string;
  proposed: string;
  marks: { code: string; state: CriterionState }[];
  marksLabel: string;
  verified: string;
  waiting: string;
  overdue: string | null;
  status: StatusBadgeView;
  /** "Review" for a pending employee, "View" otherwise. */
  action: string;
  actionLabel: string;
}

/** Figma "Review queue" rows: who, from which request, what was submitted, how long waiting. */
export function queueRows(
  page: ReviewQueuePage,
  now: Date,
  locale: Locale,
  t: Translate,
): QueueRowView[] {
  const number = new Intl.NumberFormat(locale);
  return page.items.map((item) => {
    const pending = item.reviewStatus === 'pending';
    return {
      id: item.lineId,
      href: employeeStatusHref(item.request.id, item.lineId),
      name: item.fullName,
      detail: `${item.employeeNumber} · ${item.grade}`,
      request: item.request.reference,
      entityCode: item.request.entity.code,
      stage: stageView(item.request.stage, locale, t).label,
      proposed:
        item.proposedPercent === null
          ? t('dashboard.notProposed')
          : formatPercent(item.proposedPercent, locale),
      marks: item.criteria.map((criterion) => ({ code: criterion.code, state: criterion.mark })),
      marksLabel: item.criteria
        .map((criterion) =>
          t('dashboard.criterionMark', {
            code: criterion.code,
            state: t(`dashboard.markStates.${criterion.mark}`),
          }),
        )
        .join(', '),
      verified: t('review.verifiedOf', {
        verified: number.format(item.verified),
        total: number.format(item.criteria.length),
      }),
      waiting: formatAge(item.waitingSince, now, locale),
      overdue: item.overdue
        ? t('review.overdue', { days: number.format(page.reminderDays) })
        : null,
      status: employeeBadge(item.request.status, item.reviewStatus, true, t),
      action: pending ? t('review.review') : t('review.view'),
      actionLabel: pending
        ? t('review.reviewOf', { name: item.fullName })
        : t('review.viewOf', { name: item.fullName }),
    };
  });
}

// One employee ----------------------------------------------------------------------------

/** Whether Sirius HR can still verify and decide this employee. */
export function inReview(request: IncrementRequest, line: RequestLine): boolean {
  return line.reviewStatus === 'pending' && IN_REVIEW_STATUSES.includes(request.status);
}

/** Criteria not yet verified for this employee. */
export function unverified(line: RequestLine): number {
  return line.criteria.filter((criterion) => criterion.verification === null).length;
}

/**
 * The employee to review next: the first pending one after this one in the request (wrapping
 * round), or none when every other employee is decided or returned.
 */
export function nextPending(request: IncrementRequest, lineId: string): RequestLine | undefined {
  const index = request.lines.findIndex((line) => line.id === lineId);
  const after = [...request.lines.slice(index + 1), ...request.lines.slice(0, Math.max(index, 0))];
  return after.find((line) => line.reviewStatus === 'pending' && line.id !== lineId);
}

export interface VerificationView {
  verified: boolean;
  /** "Verified by Sara, 16 Oct 2026" or "Not verified". */
  text: string;
  button: string;
  buttonLabel: string;
}

/** The "Sirius HR check" cell of one criterion for one employee. */
export function verificationView(
  line: RequestLine,
  criterionId: string,
  code: string,
  locale: Locale,
  t: Translate,
): VerificationView {
  const verification =
    line.criteria.find((criterion) => criterion.criterionId === criterionId)?.verification ?? null;
  return verification === null
    ? {
        verified: false,
        text: t('review.notVerified'),
        button: t('review.markVerified'),
        buttonLabel: t('review.markVerifiedFor', { code, name: line.fullName }),
      }
    : {
        verified: true,
        text: t('review.verifiedBy', {
          name: verification.byName,
          date: formatDate(verification.at, locale),
        }),
        button: t('review.undo'),
        buttonLabel: t('review.undoFor', { code, name: line.fullName }),
      };
}

const options = (codes: readonly DecisionReason[], t: Translate): ReasonOption[] =>
  codes.map((code) => ({ value: code, label: reasonLabel(code, t) }));

/** The reasons offered per decision (S5a defaults, to confirm with Sirius HR). */
export function reasonOptions(t: Translate): Record<DecisionTab, ReasonOption[]> {
  return {
    approved: options(ChangeReasonSchema.options, t),
    rejected: options(RejectReasonSchema.options, t),
    returned: options(ReturnReasonSchema.options, t),
  };
}

/** The decision panel's words for this employee. */
export function decisionPanelLabels(
  line: RequestLine,
  locale: Locale,
  t: Translate,
): DecisionPanelLabels {
  const left = unverified(line);
  const name = line.fullName;
  return {
    tabs: t('decision.tabs'),
    tab: {
      approved: t('decision.approve'),
      rejected: t('decision.reject'),
      returned: t('decision.return'),
    },
    hint: {
      approved: t('decision.approveHint'),
      rejected: t('decision.rejectHint'),
      returned: t('decision.returnHint'),
    },
    confirm: {
      approved: t('decision.confirmApprove', { name }),
      rejected: t('decision.confirmReject', { name }),
      returned: t('decision.confirmReturn', { name }),
    },
    deciding: t('decision.deciding'),
    changeIncrement: t('decision.changeIncrement'),
    approvedPercent: t('decision.approvedPercent'),
    approvedPercentHint: t('decision.approvedPercentHint', {
      percent: line.percent === null ? t('request.notSet') : formatPercent(line.percent, locale),
    }),
    reason: t('decision.reasonLabel'),
    reasonPlaceholder: t('decision.reasonPlaceholder'),
    comment: t('decision.comment'),
    commentRequired: t('decision.commentRequired'),
    commentPlaceholder: {
      approved: t('decision.commentPlaceholderApprove'),
      rejected: t('decision.commentPlaceholderReject'),
      returned: t('decision.commentPlaceholderReturn'),
    },
    verifyFirst:
      left === 0
        ? null
        : t(`decision.verifyFirst.${pluralForm(left, locale)}`, {
            count: new Intl.NumberFormat(locale).format(left),
          }),
  };
}

export interface DecisionSummaryView {
  tone: AlertTone;
  title: string;
  body: string;
  /** Sirius HR's comment or question; empty when none. */
  comment: string;
  reason: string;
  by: string;
}

/** The decision on an employee as everyone sees it (R1-09), or null while undecided. */
export function decisionSummary(
  request: IncrementRequest,
  line: RequestLine,
  locale: Locale,
  t: Translate,
): DecisionSummaryView | null {
  const { decision } = line;
  if (decision === null) return null;
  const money = (value: string | null) =>
    value === null ? '—' : formatMoney(value, line.currency, locale);
  const common = {
    comment: decision.comment,
    reason:
      decision.reasonCode === null
        ? ''
        : t('decision.reason', { reason: reasonLabel(decision.reasonCode, t) }),
    by: t('decision.by', {
      name: decision.decidedByName,
      date: formatDateTime(decision.decidedAt, locale),
    }),
  };
  switch (decision.decision) {
    case 'approved':
      return {
        ...common,
        tone: 'success',
        title: t('decision.approvedTitle'),
        body:
          decision.approvedPercent === null
            ? t('decision.asProposed', {
                percent: line.percent === null ? '—' : formatPercent(line.percent, locale),
                amount: money(decision.approvedIncrease),
              })
            : t('decision.changed', {
                percent: formatPercent(decision.approvedPercent, locale),
                proposed: line.percent === null ? '—' : formatPercent(line.percent, locale),
                amount: money(decision.approvedIncrease),
                salary: money(decision.approvedSalary),
              }),
      };
    case 'rejected':
      return {
        ...common,
        tone: 'danger',
        title: t('decision.rejectedTitle'),
        body: t('decision.rejectedBody'),
      };
    case 'returned':
      return {
        ...common,
        tone: 'warning',
        title: t('decision.returnedTitle', { entity: entityName(request.entity, locale) }),
        body: t('decision.question'),
      };
  }
}

/** The employees still waiting for Sirius HR's decision, in the request's order. */
export function waitingLines(request: IncrementRequest): RequestLine[] {
  return request.lines.filter((line) => line.reviewStatus === 'pending');
}

/** "Decide all remaining" (R1-09): the decision panel's words for every employee still waiting. */
export function remainingDecisionLabels(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): DecisionPanelLabels {
  const number = new Intl.NumberFormat(locale);
  const count = number.format(waitingLines(request).length);
  const unchecked = waitingLines(request).filter((line) => unverified(line) > 0).length;
  return {
    tabs: t('decision.tabs'),
    tab: {
      approved: t('decision.approve'),
      rejected: t('decision.reject'),
      returned: t('decision.return'),
    },
    hint: {
      approved: t('decision.all.approveHint'),
      rejected: t('decision.all.rejectHint'),
      returned: t('decision.all.returnHint'),
    },
    confirm: {
      approved: t('decision.all.confirmApprove', { count }),
      rejected: t('decision.all.confirmReject', { count }),
      returned: t('decision.all.confirmReturn', { count }),
    },
    deciding: t('decision.deciding'),
    // Approving another increment is per employee: these never show for everyone at once.
    changeIncrement: '',
    approvedPercent: '',
    approvedPercentHint: '',
    reason: t('decision.reasonLabel'),
    reasonPlaceholder: t('decision.reasonPlaceholder'),
    comment: t('decision.comment'),
    commentRequired: t('decision.commentRequired'),
    commentPlaceholder: {
      approved: t('decision.commentPlaceholderApprove'),
      rejected: t('decision.commentPlaceholderReject'),
      returned: t('decision.commentPlaceholderReturn'),
    },
    verifyFirst:
      unchecked === 0
        ? null
        : t(`decision.all.verifyFirst.${pluralForm(unchecked, locale)}`, {
            count: number.format(unchecked),
          }),
  };
}
