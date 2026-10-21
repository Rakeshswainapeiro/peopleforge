import type { CriterionRecord } from '@peopleforge/db';
import { describe, expect, it } from 'vitest';
import {
  assessedResult,
  assessmentOf,
  effectiveMaxFileMb,
  markOf,
  missingFor,
  withFacts,
} from './criteria.js';

const criterion: CriterionRecord = {
  id: '44444444-4444-4444-8444-444444444440',
  code: 'C1',
  name: { en: '[Placeholder] C1' },
  description: { en: 'Placeholder' },
  justificationRequired: true,
  evidencePolicy: 'required',
  allowedMediaTypes: ['application/pdf'],
  maxFileMb: 10,
  threshold: null,
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
        measuredValue: null,
        justification: 'Reason',
        evidence: [file],
        verification: null,
      }),
    ).toEqual([]);
  });

  it('does not count whitespace as a justification', () => {
    expect(
      missingFor(criterion, {
        criterionId: criterion.id,
        result: 'pass',
        measuredValue: null,
        justification: '   ',
        evidence: [file],
        verification: null,
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
      measuredValue: null,
      justification: '',
      evidence: [],
      verification: null,
    };
    expect(missingFor(relaxed, assessment)).toEqual([]);
    expect(missingFor({ ...relaxed, evidencePolicy: 'none' }, assessment)).toEqual([]);
  });
  it('judges the dashboard’s facts (no content) exactly like a full assessment', () => {
    const facts = {
      criterionId: criterion.id,
      result: 'fail' as const,
      hasJustification: true,
      evidenceCount: 0,
    };
    expect(missingFor(criterion, facts)).toEqual(['evidence']);
    expect(missingFor(criterion, { ...facts, evidenceCount: 2 })).toEqual([]);
    expect(missingFor(criterion, { ...facts, result: null, hasJustification: false })).toEqual([
      'result',
      'justification',
      'evidence',
    ]);
  });
});

describe('markOf', () => {
  it('shows pass or fail only once the criterion is complete, otherwise pending', () => {
    expect(markOf('pass', [])).toBe('pass');
    expect(markOf('fail', [])).toBe('fail');
    expect(markOf('pass', ['evidence'])).toBe('pending');
    expect(markOf(null, ['result'])).toBe('pending');
  });
});

describe('withFacts', () => {
  it('pairs each criterion with its facts, in the criteria’s order, skipping any without', () => {
    const second = { ...criterion, id: '44444444-4444-4444-8444-444444444441', code: 'C2' };
    const facts = (criterionId: string) => ({ criterionId, result: null });
    expect(withFacts([criterion, second], [facts(second.id), facts(criterion.id)])).toEqual([
      { criterion, facts: facts(criterion.id) },
      { criterion: second, facts: facts(second.id) },
    ]);
    expect(withFacts([criterion, second], [facts(second.id)])).toEqual([
      { criterion: second, facts: facts(second.id) },
    ]);
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
      measuredValue: null,
      justification: 'x',
      evidence: [],
      verification: null,
    };
    expect(assessmentOf(criterion, [saved])).toBe(saved);
  });
});

describe('assessedResult [R1-05]', () => {
  const rated = { threshold: { operator: 'gte', value: '3.5', unit: 'rating' } } as const;

  it('lets the measured value decide a threshold criterion, whatever result was sent', () => {
    expect(assessedResult(rated, { result: 'fail', measuredValue: '4' })).toEqual({
      result: 'pass',
      measuredValue: '4',
    });
    expect(assessedResult(rated, { result: 'pass', measuredValue: '3.49' })).toEqual({
      result: 'fail',
      measuredValue: '3.49',
    });
    expect(assessedResult(rated, { result: 'pass' })).toEqual({
      result: null,
      measuredValue: null,
    });
  });

  it('keeps the judgement and drops any value without a threshold', () => {
    expect(assessedResult(criterion, { result: 'pass', measuredValue: '9' })).toEqual({
      result: 'pass',
      measuredValue: null,
    });
    // A criterion not in the set: the API refuses it before saving; nothing is derived.
    expect(assessedResult(undefined, { result: null })).toEqual({
      result: null,
      measuredValue: null,
    });
  });
});
