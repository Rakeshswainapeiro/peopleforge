import { describe, expect, it } from 'vitest';
import {
  ApprovedPercentSchema,
  DashboardFilterSchema,
  DecideLineSchema,
  DecideRemainingSchema,
  FINAL_STATUSES,
  IN_REVIEW_STATUSES,
  MAX_COMMENT_LENGTH,
  RequestStageSchema,
  RequestStatusSchema,
  ResubmitRequestSchema,
  ReviewQueueQuerySchema,
} from './increment-requests.js';
import { NotificationKindSchema } from './notifications.js';

// Sirius HR's review contract (R1-07 … R1-10).
const ID = '00000000-0000-4000-8000-0000000e000a';

describe('statuses [R1-09]', () => {
  it('know the review statuses, and which are final', () => {
    expect(RequestStatusSchema.options).toEqual([
      'draft',
      'submitted',
      'under_review',
      'returned',
      'approved',
      'partly_approved',
      'rejected',
    ]);
    expect(FINAL_STATUSES).toEqual(['approved', 'partly_approved', 'rejected']);
    expect(IN_REVIEW_STATUSES).toEqual(['submitted', 'under_review', 'returned']);
    expect(NotificationKindSchema.options).toContain('employee_returned');
  });
});

describe('DecideRemainingSchema [R1-09]', () => {
  const ok = (body: unknown) => DecideRemainingSchema.safeParse(body).success;

  it('approves everyone as proposed, rejects or returns with a reason and a comment', () => {
    expect(DecideRemainingSchema.parse({ decision: 'approved', comment: ' Fine. ' })).toEqual({
      decision: 'approved',
      comment: 'Fine.',
    });
    expect(ok({ decision: 'approved' })).toBe(true);
    // Another percentage is decided per employee, never for everyone at once.
    expect(ok({ decision: 'approved', approvedPercent: '4.5' })).toBe(false);
    expect(ok({ decision: 'rejected', reasonCode: 'budget', comment: 'Over budget.' })).toBe(true);
    expect(ok({ decision: 'rejected', reasonCode: 'budget' })).toBe(false);
    expect(ok({ decision: 'returned', reasonCode: 'missing_evidence', comment: 'Add C1.' })).toBe(
      true,
    );
    expect(NotificationKindSchema.options).toEqual(
      expect.arrayContaining(['employees_approved', 'employees_rejected', 'employees_returned']),
    );
  });
});

describe('DecideLineSchema [R1-08, R1-09]', () => {
  const ok = (body: unknown) => DecideLineSchema.safeParse(body).success;

  it('approves as proposed with nothing else', () => {
    expect(DecideLineSchema.parse({ decision: 'approved' })).toEqual({ decision: 'approved' });
  });

  it('needs a reason and a comment to approve another percentage', () => {
    expect(ok({ decision: 'approved', approvedPercent: '4.5' })).toBe(false);
    expect(ok({ decision: 'approved', approvedPercent: '4.5', reasonCode: 'budget' })).toBe(false);
    expect(
      ok({ decision: 'approved', approvedPercent: '4.5', reasonCode: 'budget', comment: '  ' }),
    ).toBe(false);
    expect(
      DecideLineSchema.parse({
        decision: 'approved',
        approvedPercent: '4.5',
        reasonCode: 'budget',
        comment: ' Budget band. ',
      }),
    ).toEqual({
      decision: 'approved',
      approvedPercent: '4.5',
      reasonCode: 'budget',
      comment: 'Budget band.',
    });
  });

  it('needs the right reason and a comment to reject or return', () => {
    expect(ok({ decision: 'rejected', reasonCode: 'budget', comment: 'Over budget.' })).toBe(true);
    expect(ok({ decision: 'rejected', reasonCode: 'budget', comment: '' })).toBe(false);
    expect(ok({ decision: 'rejected', reasonCode: 'proposal_change', comment: 'x' })).toBe(false);
    expect(ok({ decision: 'returned', reasonCode: 'missing_evidence', comment: 'Add C1.' })).toBe(
      true,
    );
    expect(ok({ decision: 'returned', reasonCode: 'budget', comment: 'x' })).toBe(false);
    expect(ok({ decision: 'returned', reasonCode: 'other' })).toBe(false);
    expect(ok({ decision: 'escalated' })).toBe(false);
    expect(ok({ decision: 'rejected', reasonCode: 'other', comment: 'x', extra: 1 })).toBe(false);
    expect(
      ok({
        decision: 'rejected',
        reasonCode: 'other',
        comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1),
      }),
    ).toBe(false);
  });

  it.each(['0', '0.00', '100.01', '-1', 'abc'])('refuses %j as an approved percentage', (value) => {
    expect(ApprovedPercentSchema.safeParse(value).success).toBe(false);
  });

  it.each(['0.01', '4.5', '100'])('accepts %j as an approved percentage', (value) => {
    expect(ApprovedPercentSchema.safeParse(value).success).toBe(true);
  });
});

describe('ResubmitRequestSchema [R1-08]', () => {
  it('takes the version and an optional note', () => {
    expect(ResubmitRequestSchema.parse({ version: 3 })).toEqual({ version: 3, note: '' });
    expect(ResubmitRequestSchema.parse({ version: 3, note: ' Fixed. ' })).toEqual({
      version: 3,
      note: 'Fixed.',
    });
    expect(ResubmitRequestSchema.safeParse({ version: 0 }).success).toBe(false);
  });
});

describe('ReviewQueueQuerySchema [R1-07]', () => {
  it('defaults to the employees to review, first page', () => {
    expect(ReviewQueueQuerySchema.parse({})).toEqual({ filter: 'pending', page: 1, pageSize: 10 });
    expect(
      ReviewQueueQuerySchema.parse({
        filter: 'overdue',
        entityId: ID,
        search: ' ',
        pageSize: '25',
      }),
    ).toEqual({ filter: 'overdue', entityId: ID, page: 1, pageSize: 25 });
    expect(ReviewQueueQuerySchema.safeParse({ filter: 'mine' }).success).toBe(false);
    expect(DashboardFilterSchema.parse({ entityId: ID })).toEqual({ entityId: ID });
  });
});

describe('RequestStageSchema [R1-10]', () => {
  it('has the decision and decided stages', () => {
    expect(RequestStageSchema.parse({ kind: 'decision', of: 5 })).toEqual({
      kind: 'decision',
      of: 5,
    });
    expect(RequestStageSchema.parse({ kind: 'decided', of: 5 })).toEqual({
      kind: 'decided',
      of: 5,
    });
  });
});
