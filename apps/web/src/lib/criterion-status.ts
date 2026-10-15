import {
  hasText,
  missingFor,
  type CriterionMissing,
  type CriterionRule,
} from '@peopleforge/contracts';
import { interpolate } from '@peopleforge/i18n';
import type { Locale } from '@sirius/shared-types';

/** "To complete: {items}." and each item's words, translated on the server. */
export interface MissingLabels {
  toComplete: string;
  items: Readonly<Record<CriterionMissing, string>>;
}

function itemLabel(item: CriterionMissing, labels: MissingLabels): string {
  switch (item) {
    case 'result':
      return labels.items.result;
    case 'justification':
      return labels.items.justification;
    case 'evidence':
      return labels.items.evidence;
  }
}

export interface CriterionStatus {
  missing: CriterionMissing[];
  complete: boolean;
  /** "To complete: add a justification, attach evidence.", or undefined when complete. */
  text: string | undefined;
}

/**
 * A criterion card's status from what is on screen now (R1-03, R1-06): the result chosen, the
 * justification typed and the files attached, judged by the API's own rule, so the card
 * agrees with what saving will record.
 */
export function criterionStatus(
  rule: CriterionRule,
  current: { result: 'pass' | 'fail' | null; justification: string; evidenceCount: number },
  labels: MissingLabels,
  locale: Locale,
): CriterionStatus {
  const missing = missingFor(rule, {
    result: current.result,
    hasJustification: hasText(current.justification),
    evidenceCount: current.evidenceCount,
  });
  const items = new Intl.ListFormat(locale, { style: 'short', type: 'unit' }).format(
    missing.map((item) => itemLabel(item, labels)),
  );
  return {
    missing,
    complete: missing.length === 0,
    text: missing.length === 0 ? undefined : interpolate(labels.toComplete, { items }),
  };
}
