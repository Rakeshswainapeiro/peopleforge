import type { CriterionRecord } from '@peopleforge/db';
import { describe, expect, it } from 'vitest';
import { assessmentOf, effectiveMaxFileMb, missingFor } from './criteria.js';

const criterion: CriterionRecord = {
  id: '44444444-4444-4444-8444-444444444440',
  code: 'C1',
  name: { en: '[Placeholder] C1' },
  description: { en: 'Placeholder' },
  justificationRequired: true,
  evidencePolicy: 'required',
  allowedMediaTypes: ['application/pdf'],
  maxFileMb: 10,
};
const file = {
  id: '55555555-5555-4555-8555-555555555550',
  fileName: 'a.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 10,
  createdAt: new Date('2026-10-14T08:00:00Z'),
};

describe('missingFor [R1-03, R1-06]', () => {
  it('lists everything for a criterion not started', () => {
    expect(missingFor(criterion, assessmentOf(criterion, []))).toEqual([
      'result',
      'justification',
      'evidence',
    ]);
  });

  it.each(['pass', 'fail'] as const)('treats %s alike: complete with text and a file', (result) => {
    expect(
      missingFor(criterion, {
        criterionId: criterion.id,
        result,
        justification: 'Reason',
        evidence: [file],
      }),
    ).toEqual([]);
  });

  it('does not count whitespace as a justification', () => {
    expect(
      missingFor(criterion, {
        criterionId: criterion.id,
        result: 'pass',
        justification: '   ',
        evidence: [file],
      }),
    ).toEqual(['justification']);
  });

  it('follows the criterion’s configuration for justification and files [R1-05]', () => {
    const relaxed = {
      ...criterion,
      justificationRequired: false,
      evidencePolicy: 'optional' as const,
    };
    const assessment = {
      criterionId: criterion.id,
      result: 'pass' as const,
      justification: '',
      evidence: [],
    };
    expect(missingFor(relaxed, assessment)).toEqual([]);
    expect(missingFor({ ...relaxed, evidencePolicy: 'none' }, assessment)).toEqual([]);
  });
});

describe('effectiveMaxFileMb', () => {
  it('caps a criterion’s limit at the API’s', () => {
    expect(effectiveMaxFileMb({ maxFileMb: 5 })).toBe(5);
    expect(effectiveMaxFileMb({ maxFileMb: 50 })).toBe(10);
  });
});

describe('assessmentOf', () => {
  it('finds the saved assessment of the criterion', () => {
    const saved = {
      criterionId: criterion.id,
      result: 'fail' as const,
      justification: 'x',
      evidence: [],
    };
    expect(assessmentOf(criterion, [saved])).toBe(saved);
  });
});
