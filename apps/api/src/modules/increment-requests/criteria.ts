import {
  hasText,
  MAX_EVIDENCE_FILE_MB,
  missingFor as sharedMissingFor,
  thresholdResult,
  type CriterionInput,
  type CriterionMark,
  type CriterionMissing,
} from '@peopleforge/contracts';
import type {
  CriterionAssessmentRecord,
  CriterionFacts,
  CriterionRecord,
  CriterionResultValue,
} from '@peopleforge/db';

/**
 * What still stops a criterion counting as complete (R1-03, R1-06): the shared rule from
 * @peopleforge/contracts, fed with a saved assessment (request page) or the facts (dashboard).
 */
export function missingFor(
  criterion: Pick<CriterionRecord, 'justificationRequired' | 'evidencePolicy'>,
  saved: CriterionAssessmentRecord | CriterionFacts,
): CriterionMissing[] {
  return sharedMissingFor(
    criterion,
    'evidence' in saved
      ? {
          result: saved.result,
          hasJustification: hasText(saved.justification),
          evidenceCount: saved.evidence.length,
        }
      : saved,
  );
}

/** ✓ pass / ✗ fail once the criterion is complete; ○ until then (R1-06, never colour alone). */
export function markOf(
  result: CriterionResultValue | null,
  missing: readonly CriterionMissing[],
): CriterionMark {
  return result === null || missing.length > 0 ? 'pending' : result;
}

/**
 * Each criterion of a set with its facts, in the set's order. Facts are matched by criterion,
 * never by position; a criterion without facts is left out.
 */
export function withFacts<T extends { criterionId: string }>(
  criteria: readonly CriterionRecord[],
  facts: readonly T[],
): { criterion: CriterionRecord; facts: T }[] {
  const byCriterion = new Map(facts.map((entry) => [entry.criterionId, entry]));
  return criteria.flatMap((criterion) => {
    const entry = byCriterion.get(criterion.id);
    return entry === undefined ? [] : [{ criterion, facts: entry }];
  });
}

/** A criterion may set a lower file limit than the API's, never a higher one. */
export function effectiveMaxFileMb(criterion: Pick<CriterionRecord, 'maxFileMb'>): number {
  return Math.min(criterion.maxFileMb, MAX_EVIDENCE_FILE_MB);
}

/** An employee's assessment of a criterion, or "not started" when nothing is saved yet. */
export function assessmentOf(
  criterion: CriterionRecord,
  saved: readonly CriterionAssessmentRecord[],
): CriterionAssessmentRecord {
  return (
    saved.find((entry) => entry.criterionId === criterion.id) ?? {
      criterionId: criterion.id,
      result: null,
      measuredValue: null,
      justification: '',
      evidence: [],
      verification: null,
    }
  );
}

/**
 * What is saved for a criterion (R1-03, R1-05). With a threshold, the measured value decides
 * the result (whatever was sent as the result); without one, Pass or Fail is the preparer's
 * judgement and no value is kept.
 */
export function assessedResult(
  criterion: Pick<CriterionRecord, 'threshold'> | undefined,
  input: Pick<CriterionInput, 'result' | 'measuredValue'>,
): { result: CriterionResultValue | null; measuredValue: string | null } {
  const threshold = criterion?.threshold ?? null;
  if (threshold === null) return { result: input.result, measuredValue: null };
  const measuredValue = input.measuredValue ?? null;
  return { result: thresholdResult(threshold, measuredValue), measuredValue };
}
