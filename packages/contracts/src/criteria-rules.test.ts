import { describe, expect, it } from 'vitest';
import { hasText, missingFor } from './criteria-rules.js';

const strict = { justificationRequired: true, evidencePolicy: 'required' as const };
const none = { result: null, hasJustification: false, evidenceCount: 0 };

describe('missingFor [R1-03, R1-06]', () => {
  it('lists the result, the justification and the evidence until given', () => {
    expect(missingFor(strict, none)).toEqual(['result', 'justification', 'evidence']);
    expect(
      missingFor(strict, { result: 'fail', hasJustification: true, evidenceCount: 1 }),
    ).toEqual([]);
  });

  it('asks only for what the criterion is configured to need', () => {
    expect(
      missingFor(
        { justificationRequired: false, evidencePolicy: 'optional' },
        { ...none, result: 'pass' },
      ),
    ).toEqual([]);
    expect(missingFor({ justificationRequired: false, evidencePolicy: 'none' }, none)).toEqual([
      'result',
    ]);
  });
});

describe('hasText', () => {
  it('treats blank space as nothing', () => {
    expect(hasText('  \n ')).toBe(false);
    expect(hasText(' Rated 4 of 5 ')).toBe(true);
  });
});
