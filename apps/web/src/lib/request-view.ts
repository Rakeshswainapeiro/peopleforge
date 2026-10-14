import type { IncrementRequest } from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import type { ProposalRowView, ProposalsTableLabels } from '@/components/requests/proposals-table';
import type { MessageKey, Translate } from '@/i18n/translator';
import { formatMoney, formatPercent, trimDecimal } from './format';
import { REQUEST_ERROR_KEYS } from './request-errors';

/** Server-side view model for the proposals table: formatted, labelled, translated. */
export function proposalRows(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): ProposalRowView[] {
  return request.lines.map((line) => ({
    lineId: line.id,
    fullName: line.fullName,
    employeeNumber: line.employeeNumber,
    grade: line.grade,
    currencyCode: line.currency,
    current: formatMoney(line.currentSalary, line.currency, locale),
    // Criteria results arrive with S3; until then every criterion is "not assessed yet".
    criteria: request.criteria.map((criterion) => ({
      code: criterion.code,
      state: 'pending' as const,
    })),
    criteriaLabel: t('request.criteriaComplete', {
      done: 0,
      total: request.criteria.length,
    }),
    kind: line.proposedKind ?? 'percent',
    value: line.proposedValue === null ? '' : trimDecimal(line.proposedValue),
    labels: {
      proposedAs: t('request.proposedAsFor', { name: line.fullName }),
      value: t('request.valueFor', { name: line.fullName }),
      remove: t('request.remove', { name: line.fullName }),
    },
  }));
}

export interface TotalsView {
  employees: string;
  increase: string;
  average: string;
}

/** Figma: "Employees: 4   Total proposed increase: AED 4,488 / month   Average: 6.6%". */
export function totalsView(request: IncrementRequest, locale: Locale, t: Translate): TotalsView {
  const { totals } = request;
  const increase =
    totals.increaseByCurrency.length === 0
      ? t('request.notSet')
      : totals.increaseByCurrency
          .map((sum) =>
            t('request.perMonth', { amount: formatMoney(sum.amount, sum.currency, locale) }),
          )
          .join(' + ');
  return {
    employees: new Intl.NumberFormat(locale).format(totals.employees),
    increase,
    average:
      totals.averagePercent === null
        ? t('request.notSet')
        : formatPercent(totals.averagePercent, locale),
  };
}

export function tableLabels(t: Translate): ProposalsTableLabels {
  return {
    caption: t('request.tableCaption'),
    colEmployee: t('request.colEmployee'),
    colGrade: t('request.colGrade'),
    colCurrent: t('request.colCurrent'),
    colProposedAs: t('request.colProposedAs'),
    colValue: t('request.colValue'),
    colCriteria: t('request.colCriteria'),
    criterionStates: {
      pass: t('request.criterionState.pass'),
      fail: t('request.criterionState.fail'),
      pending: t('request.criterionState.pending'),
    },
    colActions: t('request.colActions'),
    percentOption: t('request.percentOption'),
    valuePlaceholder: t('request.valuePlaceholder'),
    save: t('request.saveDraft'),
    saving: t('request.saving'),
  };
}

const ROW_ERROR_KEYS = [
  'request.errors.notPositive',
  'request.errors.overLimit',
  'request.errors.format',
] as const satisfies readonly MessageKey[];

/** Every message the save can return, translated, for the client table. */
export function saveMessages(t: Translate): [string, string][] {
  return [...REQUEST_ERROR_KEYS, ...ROW_ERROR_KEYS].map((key) => [key, t(key)]);
}

/** "1 employee added" / "4 employees added", by the locale's plural rules. */
export function employeesAdded(count: number, locale: Locale, t: Translate): string {
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
  return t(`request.employeesAdded.${form}`, {
    count: new Intl.NumberFormat(locale).format(count),
  });
}
