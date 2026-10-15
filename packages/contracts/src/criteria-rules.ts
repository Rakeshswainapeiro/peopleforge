import type { CriterionMissing, CriterionResult, EvidencePolicy } from './increment-requests.js';

/** What a criterion asks for (its configuration, R1-05). */
export interface CriterionRule {
  justificationRequired: boolean;
  evidencePolicy: EvidencePolicy;
}

/** What has been given for one employee: saved (API) or typed so far (the request page). */
export interface CriterionProgress {
  result: CriterionResult | null;
  hasJustification: boolean;
  evidenceCount: number;
}

/**
 * What still stops a criterion counting as complete for one employee (R1-03, R1-06). Agreed
 * for S3: Fail needs the same justification and evidence as Pass, because Sirius HR reviews the
 * reasoning either way. One rule for the API (saved data) and the request page (live, as the
 * user types), so the two never disagree.
 */
export function missingFor(rule: CriterionRule, progress: CriterionProgress): CriterionMissing[] {
  const missing: CriterionMissing[] = [];
  if (progress.result === null) missing.push('result');
  if (rule.justificationRequired && !progress.hasJustification) missing.push('justification');
  if (rule.evidencePolicy === 'required' && progress.evidenceCount === 0) missing.push('evidence');
  return missing;
}

/** Whether a justification counts as given: anything but blank space. */
export function hasText(value: string): boolean {
  return value.trim() !== '';
}
