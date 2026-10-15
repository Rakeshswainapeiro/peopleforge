import type { IncrementRequest } from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';
import { formatMoney, formatPercent } from './format';
import { pluralForm } from './plural';

/** The monthly increase, per currency ("AED 3,628"; "AED 1,200 + USD 300"), or "—". */
export function totalIncrease(request: IncrementRequest, locale: Locale, t: Translate): string {
  const sums = request.totals.increaseByCurrency;
  return sums.length === 0
    ? t('figures.none')
    : sums.map((sum) => formatMoney(sum.amount, sum.currency, locale)).join(' + ');
}

/** One figure: a StatCard's label, value and hint, as text. */
export interface FigureView {
  label: string;
  value: string;
  hint: string;
}

/**
 * Figma "Employees · Total increment / month · Average increment": the submit dialog's tiles
 * and the request page's cards, from the same numbers.
 */
export function requestFigures(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): FigureView[] {
  const number = new Intl.NumberFormat(locale);
  const notComplete = request.lines.filter((line) =>
    line.criteria.some((criterion) => criterion.missing.length > 0),
  ).length;
  return [
    {
      label: t('figures.employees'),
      value: number.format(request.lines.length),
      hint:
        notComplete === 0
          ? t('figures.allComplete', { count: number.format(request.criteria.length) })
          : t(`figures.notComplete.${pluralForm(notComplete, locale)}`, {
              count: number.format(notComplete),
            }),
    },
    {
      label: t('figures.totalIncrease'),
      value: totalIncrease(request, locale, t),
      hint: t('figures.acrossEmployees'),
    },
    {
      label: t('figures.average'),
      value:
        request.totals.averagePercent === null
          ? t('figures.none')
          : formatPercent(request.totals.averagePercent, locale),
      hint: t('figures.proposed'),
    },
  ];
}
