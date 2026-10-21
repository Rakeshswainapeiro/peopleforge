import type { CriterionThreshold } from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';

/** "Passes at 3.5 or more (rating)" (R1-05), the number in the reader's digits. */
export function thresholdText(threshold: CriterionThreshold, locale: Locale, t: Translate): string {
  return t(`request.threshold.${threshold.operator}`, {
    value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      threshold.value as `${number}`,
    ),
    unit: t(`request.units.${threshold.unit}`),
  });
}
