import { FINAL_STATUSES, type RequestStage, type RequestStatus } from '@peopleforge/contracts';

/**
 * Where a request stands in Sirius HR's review (R1-10). Criteria are verified in any order
 * (S5a); the stage is the count verified for every employee still in review, plus one. With
 * all verified the request is at the decision; once final, decided.
 *
 * @param verified criteria verified for every employee still pending (all, when none is).
 */
export function stageOf(
  status: RequestStatus,
  criteriaCount: number,
  verified: number,
): RequestStage {
  const of = criteriaCount;
  if (status === 'draft') return { kind: 'not_submitted', of };
  if (FINAL_STATUSES.includes(status)) return { kind: 'decided', of };
  if (verified >= of) return { kind: 'decision', of };
  return { kind: 'criterion', criterion: verified + 1, of };
}
