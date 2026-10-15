import { describe, expect, it } from 'vitest';
import { criterionStatus, type MissingLabels } from './criterion-status';

const LABELS: MissingLabels = {
  toComplete: 'To complete: {items}.',
  items: {
    result: 'choose Pass or Fail',
    justification: 'add a justification',
    evidence: 'attach evidence',
  },
};
const RULE = { justificationRequired: true, evidencePolicy: 'required' as const };

describe('criterionStatus [R1-03, R1-06]', () => {
  it('says what is still missing, in a sentence', () => {
    expect(
      criterionStatus(RULE, { result: null, justification: ' ', evidenceCount: 0 }, LABELS, 'en'),
    ).toEqual({
      missing: ['result', 'justification', 'evidence'],
      complete: false,
      text: 'To complete: choose Pass or Fail, add a justification, attach evidence.',
    });
    expect(
      criterionStatus(RULE, { result: 'pass', justification: '', evidenceCount: 1 }, LABELS, 'en')
        .text,
    ).toBe('To complete: add a justification.');
  });

  it('is complete once everything the criterion asks for is there', () => {
    expect(
      criterionStatus(
        RULE,
        { result: 'fail', justification: 'Joined in March.', evidenceCount: 1 },
        LABELS,
        'en',
      ),
    ).toEqual({ missing: [], complete: true, text: undefined });
  });
});
