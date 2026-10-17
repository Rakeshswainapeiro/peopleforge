import type { DecisionReason, IncrementRequest } from '@peopleforge/contracts';
import type { CriterionState, Step } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';
import { formatDate, formatDateTime, formatMoney, formatPercent } from './format';
import { pluralForm } from '@peopleforge/i18n';
import { totalIncrease } from './request-figures';
import { criterionState } from './request-view';
import { employeeBadge, statusBadge, type StatusBadgeView } from './request-status';
import { employeeStatusHref } from './routes';
import { entityName } from './viewer-display';

/** Who has the request now, in the subtitle: Sirius HR, the subsidiary, or decided on a date. */
function holder(request: IncrementRequest, locale: Locale, t: Translate): string {
  if (request.decidedAt !== null) {
    return t('requestDetail.closed', { date: formatDate(request.decidedAt, locale) });
  }
  return request.status === 'returned'
    ? t('requestDetail.withSubsidiary', { entity: entityName(request.entity, locale) })
    : t('requestDetail.withSirius');
}

/**
 * Figma "INC-2026-0152 · Submitted 15 Oct 2026, 11:14 by Priya Nair · Subsidiary C · With
 * Sirius HR". Requests submitted before the name was kept (migration 0007) leave out "by …".
 */
export function detailSubtitle(request: IncrementRequest, locale: Locale, t: Translate): string {
  const values = {
    // Only submitted requests reach the detail page, so `submittedAt` is set; the creation time
    // stands in rather than an empty date should that ever not hold.
    date: formatDateTime(request.submittedAt ?? request.createdAt, locale),
    entity: entityName(request.entity, locale),
    with: holder(request, locale, t),
  };
  return request.submittedByName === null
    ? t('requestDetail.subtitleNoName', values)
    : t('requestDetail.subtitle', { ...values, name: request.submittedByName });
}

export interface SubmittedBannerView {
  title: string;
  body: string;
}

/** Figma's green banner after submitting: what went, and what happens next. */
export function submittedBanner(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): SubmittedBannerView {
  const number = new Intl.NumberFormat(locale);
  return {
    title: t('requestDetail.submittedTitle', { reference: request.reference }),
    body: t('requestDetail.submittedBody', {
      employees: t(`figures.employeeCount.${pluralForm(request.lines.length, locale)}`, {
        count: number.format(request.lines.length),
      }),
      amount: totalIncrease(request, locale, t),
      of: number.format(request.criteria.length),
    }),
  };
}

/**
 * Figma "Where this request is": Submitted → Criterion 1 … N → Decision (R1-10). Criteria are
 * verified in any order; a criterion is done once verified for every employee still in review,
 * and the first one that isn't is current. All verified: the decision is current; decided: done.
 */
export function reviewSteps(request: IncrementRequest, locale: Locale, t: Translate): Step[] {
  const submitted = request.submittedAt;
  const pending = t('requestDetail.pending');
  const { stage } = request;
  const verified =
    stage.kind === 'criterion'
      ? stage.criterion - 1
      : stage.kind === 'not_submitted'
        ? 0
        : request.criteria.length;
  const decided = request.decidedAt;
  return [
    {
      label: t('requestDetail.stepSubmitted'),
      detail:
        submitted === null
          ? pending
          : t('requestDetail.stepDone', { date: formatDate(submitted, locale) }),
      state: submitted === null ? 'current' : 'done',
    },
    ...request.criteria.map((_criterion, index): Step => {
      const done = index < verified;
      const current = submitted !== null && stage.kind === 'criterion' && index === verified;
      return {
        label: t('requestDetail.stepCriterion', { number: String(index + 1) }),
        detail: done
          ? t('requestDetail.stepVerified')
          : current
            ? t('requestDetail.stepReviewing')
            : pending,
        state: done ? 'done' : current ? 'current' : 'todo',
      };
    }),
    {
      label: t('requestDetail.stepDecision'),
      detail:
        decided === null
          ? stage.kind === 'decision'
            ? t('requestDetail.stepAwaiting')
            : pending
          : t('requestDetail.stepDecided', {
              status: statusBadge(request.status, t).label,
              date: formatDate(decided, locale),
            }),
      state: decided !== null ? 'done' : stage.kind === 'decision' ? 'current' : 'todo',
    },
  ];
}

export interface DetailRowView {
  id: string;
  name: string;
  number: string;
  grade: string;
  current: string;
  /** "6%", or "Not set". */
  percent: string;
  /** "+ AED 600"; null without a proposal. */
  increase: string | null;
  marks: { code: string; state: CriterionState }[];
  /** "C1 pass, C2 not complete, …" for screen readers. */
  marksLabel: string;
  status: StatusBadgeView;
  href: string;
  viewLabel: string;
}

/**
 * Figma request detail "Employees": each employee's salary, proposal, criteria marks and own
 * status (R1-09), with View Status.
 */
export function detailRows(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
  group = false,
): DetailRowView[] {
  return request.lines.map((line) => {
    const status = employeeBadge(request.status, line.reviewStatus, group, t);
    const marks = request.criteria.map((criterion, index) => ({
      code: criterion.code,
      // The API returns a line's criteria in the request's criteria order.
      state: criterionState(line.criteria.at(index)),
    }));
    return {
      id: line.id,
      name: line.fullName,
      number: line.employeeNumber,
      grade: line.grade,
      current: formatMoney(line.currentSalary, line.currency, locale),
      percent: line.percent === null ? t('request.notSet') : formatPercent(line.percent, locale),
      increase:
        line.increase === null
          ? null
          : t('requestDetail.increase', {
              amount: formatMoney(line.increase, line.currency, locale),
            }),
      marks,
      marksLabel: marks
        .map((mark) =>
          t('dashboard.criterionMark', {
            code: mark.code,
            state: t(`dashboard.markStates.${mark.state}`),
          }),
        )
        .join(', '),
      status,
      href: employeeStatusHref(request.id, line.id),
      viewLabel: t('dashboard.viewStatusOf', { name: line.fullName }),
    };
  });
}

/** "Criteria C1–C5" (Figma), or "Criteria" for a request without criteria. */
export function criteriaColumn(request: IncrementRequest, t: Translate): string {
  const first = request.criteria.at(0);
  const last = request.criteria.at(-1);
  return first === undefined || last === undefined
    ? t('request.colCriteria')
    : t('requestDetail.colCriteria', { first: first.code, last: last.code });
}

export interface ReturnedView {
  title: string;
  body: string;
  /** Each returned employee with Sirius HR's reason and question. */
  items: { id: string; name: string; reason: string; comment: string }[];
}

/**
 * The amber banner of a returned request (R1-08): which employees came back and what Sirius HR
 * asks about each. Null when nobody is returned.
 */
export function returnedView(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
  group: boolean,
): ReturnedView | null {
  const returned = request.lines.filter((line) => line.reviewStatus === 'returned');
  if (returned.length === 0) return null;
  const count = new Intl.NumberFormat(locale).format(returned.length);
  const form = pluralForm(returned.length, locale);
  return {
    title: group
      ? t(`requestDetail.returnedGroupTitle.${form}`, {
          count,
          entity: entityName(request.entity, locale),
        })
      : t(`requestDetail.returnedTitle.${form}`, { count }),
    body: t('requestDetail.returnedBody'),
    items: returned.map((line) => ({
      id: line.id,
      name: line.fullName,
      reason: reasonLabel(line.decision?.reasonCode ?? null, t),
      comment: line.decision?.comment ?? '',
    })),
  };
}

/** A decision reason in words; none when the decision gave none. */
export function reasonLabel(code: DecisionReason | null, t: Translate): string {
  return code === null ? '' : t(`reasons.${code}`);
}
