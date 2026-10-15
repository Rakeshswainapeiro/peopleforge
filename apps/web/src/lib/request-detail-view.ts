import type { IncrementRequest } from '@peopleforge/contracts';
import type { CriterionState, Step } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';
import { formatDate, formatDateTime, formatMoney, formatPercent } from './format';
import { pluralForm } from './plural';
import { totalIncrease } from './request-figures';
import { criterionState } from './request-view';
import { statusBadge, type StatusBadgeView } from './request-status';
import { employeeStatusHref } from './routes';
import { entityName } from './viewer-display';

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
 * Figma "Where this request is": Submitted → Criterion 1 … N → Decision. Sirius HR reviews the
 * criteria in order; until review lands (S5) a submitted request waits at Criterion 1.
 */
export function reviewSteps(request: IncrementRequest, locale: Locale, t: Translate): Step[] {
  const submitted = request.submittedAt;
  const pending = t('requestDetail.pending');
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
      const reviewing = submitted !== null && index === 0;
      return {
        label: t('requestDetail.stepCriterion', { number: String(index + 1) }),
        detail: reviewing ? t('requestDetail.stepReviewing') : pending,
        state: reviewing ? 'current' : 'todo',
      };
    }),
    { label: t('requestDetail.stepDecision'), detail: pending, state: 'todo' },
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
 * Figma request detail "Employees": each employee's salary, proposal, criteria marks and status,
 * with View Status. Every employee shares the request's status until per-employee decisions (S5).
 */
export function detailRows(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): DetailRowView[] {
  const status = statusBadge(request.status, t);
  return request.lines.map((line) => {
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
