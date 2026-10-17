import { describe, expect, it } from 'vitest';
import { stageOf } from './stage.js';

describe('stageOf [R1-10]', () => {
  it('is not submitted for a draft', () => {
    expect(stageOf('draft', 5, 0)).toEqual({ kind: 'not_submitted', of: 5 });
  });

  it('is the first criterion not yet verified for everyone', () => {
    expect(stageOf('submitted', 5, 0)).toEqual({ kind: 'criterion', criterion: 1, of: 5 });
    expect(stageOf('under_review', 5, 2)).toEqual({ kind: 'criterion', criterion: 3, of: 5 });
    expect(stageOf('returned', 5, 4)).toEqual({ kind: 'criterion', criterion: 5, of: 5 });
  });

  it('is at the decision once every criterion is verified, and decided once final', () => {
    expect(stageOf('under_review', 5, 5)).toEqual({ kind: 'decision', of: 5 });
    expect(stageOf('submitted', 0, 0)).toEqual({ kind: 'decision', of: 0 });
    for (const status of ['approved', 'partly_approved', 'rejected'] as const) {
      expect(stageOf(status, 5, 5)).toEqual({ kind: 'decided', of: 5 });
    }
  });
});
