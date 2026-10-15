import type { IncrementRequest, RequestLine } from '@peopleforge/contracts';
import type { BadgeTone, IconName, StatCardProps } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';
import { formatMoney, formatPercent } from './format';
import { pluralForm } from './plural';
import { localised } from './viewer-display';
import { evidenceHref } from './routes';

/**
 * Figma "Employee status" (R1-06, R1-07): one employee of a request, with the money, the
 * criteria as submitted and the request's progress. Read-only for everyone.
 */

/** "Current salary · Proposed · New salary if approved · Criteria passed". */
export function employeeCards(line: RequestLine, locale: Locale, t: Translate): StatCardProps[] {
  const number = new Intl.NumberFormat(locale);
  const money = (value: string) => formatMoney(value, line.currency, locale);
  const total = line.criteria.length;
  const passed = line.criteria.filter(
    (criterion) => criterion.result === 'pass' && criterion.missing.length === 0,
  ).length;
  const incomplete = line.criteria.filter((criterion) => criterion.missing.length > 0).length;
  const failed = total - passed - incomplete;
  const passedHint =
    incomplete > 0
      ? t(`employeeStatus.incomplete.${pluralForm(incomplete, locale)}`, {
          count: number.format(incomplete),
        })
      : failed > 0
        ? t(`employeeStatus.failed.${pluralForm(failed, locale)}`, { count: number.format(failed) })
        : t('employeeStatus.allPassed');
  return [
    {
      label: t('employeeStatus.currentSalary'),
      value: money(line.currentSalary),
      hint: t('employeeStatus.perMonth'),
    },
    line.percent === null || line.increase === null
      ? { label: t('employeeStatus.proposed'), value: '—', hint: t('employeeStatus.notProposed') }
      : {
          label: t('employeeStatus.proposed'),
          value: formatPercent(line.percent, locale),
          hint: t('employeeStatus.proposedIncrease', { amount: money(line.increase) }),
        },
    {
      label: t('employeeStatus.newSalary'),
      value: line.newSalary === null ? '—' : money(line.newSalary),
      hint: t('employeeStatus.perMonth'),
    },
    {
      label: t('employeeStatus.criteriaPassed'),
      value: t('employeeStatus.passedOf', {
        passed: number.format(passed),
        total: number.format(total),
      }),
      hint: passedHint,
    },
  ];
}

export interface CriterionRowView {
  id: string;
  name: string;
  result: { tone: BadgeTone; icon: IconName | undefined; label: string };
  justification: string;
  evidence: { id: string; name: string; href: string; label: string }[];
}

/** The employee's criteria as submitted: result, justification and files to download. */
export function criterionRows(
  request: IncrementRequest,
  line: RequestLine,
  locale: Locale,
  t: Translate,
): CriterionRowView[] {
  return request.criteria.flatMap((criterion) => {
    const assessment = line.criteria.find((entry) => entry.criterionId === criterion.id);
    if (assessment === undefined) return [];
    return [
      {
        id: criterion.id,
        name: `${criterion.code} · ${localised(criterion.name, locale)}`,
        result:
          assessment.result === 'pass'
            ? { tone: 'success', icon: 'check', label: t('request.pass') }
            : assessment.result === 'fail'
              ? { tone: 'danger', icon: 'x', label: t('request.fail') }
              : { tone: 'outline', icon: undefined, label: t('employeeStatus.notSet') },
        justification:
          assessment.justification.trim() === ''
            ? t('employeeStatus.none')
            : assessment.justification,
        evidence: assessment.evidence.map((file) => ({
          id: file.id,
          name: file.fileName,
          href: evidenceHref(request.id, file.id),
          label: t('employeeStatus.download', { name: file.fileName }),
        })),
      },
    ];
  });
}
