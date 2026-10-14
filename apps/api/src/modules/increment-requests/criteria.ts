import { MAX_EVIDENCE_FILE_MB, type CriterionMissing } from '@peopleforge/contracts';
import type { CriterionAssessmentRecord, CriterionRecord } from '@peopleforge/db';

/**
 * What still stops a criterion counting as complete for one employee (R1-03, R1-06). Agreed
 * for S3: Fail needs the same justification and evidence as Pass, because Sirius HR reviews the
 * reasoning either way. Each criterion's configuration says whether a justification and files
 * are needed (R1-05), so nothing here names a specific criterion.
 */
export function missingFor(
  criterion: CriterionRecord,
  assessment: CriterionAssessmentRecord,
): CriterionMissing[] {
  const missing: CriterionMissing[] = [];
  if (assessment.result === null) missing.push('result');
  if (criterion.justificationRequired && assessment.justification.trim() === '') {
    missing.push('justification');
  }
  if (criterion.evidencePolicy === 'required' && assessment.evidence.length === 0) {
    missing.push('evidence');
  }
  return missing;
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
      justification: '',
      evidence: [],
    }
  );
}
