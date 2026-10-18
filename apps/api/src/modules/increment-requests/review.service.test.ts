import { RequestDataError, type QueueLineRecord, type ReviewRepository } from '@peopleforge/db';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { ConflictError, ValidationError } from '../../errors/domain-errors.js';
import { SUB_A, unusedReview } from '../../test-support/factory.js';
import {
  alphaHr,
  CRITERION_1,
  CRITERION_IDS,
  LINE_1,
  LINE_2,
  record,
  REQUEST_ID,
  reviewer,
  workingRepository,
} from '../../test-support/increment-requests.js';
import { IncrementRequestService, verifiedForAll } from './increment-request.service.js';
import { ReviewService } from './review.service.js';

// Sirius HR's review (R1-07 … R1-10) and the subsidiary's resubmission (R1-08), on fakes; the
// repository's own rules and isolation are proven against Postgres in packages/db.
const KEY = 'decision-key-0001';
const NOW = new Date('2026-10-17T08:00:00Z');
const scopeGroup = { userId: 'reviewer', userName: 'Reviewer', kind: 'group' };
const scopeA = { userId: 'alpha', userName: 'Alpha HR', kind: 'entity', entityIds: [SUB_A] };

type FakeReview = { [K in keyof ReviewRepository]: Mock<ReviewRepository[K]> };

function fakeReview(): FakeReview {
  return {
    verify: vi.fn<ReviewRepository['verify']>(() => Promise.resolve()),
    decide: vi.fn<ReviewRepository['decide']>(() => Promise.resolve({ replayed: false })),
    resubmit: vi.fn<ReviewRepository['resubmit']>(() => Promise.resolve({ replayed: false })),
    queue: vi.fn<ReviewRepository['queue']>(() =>
      Promise.resolve({
        items: [],
        total: 0,
        counts: {
          all: 0,
          pending: 0,
          returned: 0,
          overdue: 0,
          open: 0,
          openRequests: 0,
          openEntities: 0,
        },
      }),
    ),
  };
}

/** Requests read as under review: what Sirius HR sees. */
function inReview() {
  const requests = workingRepository();
  requests.get.mockResolvedValue(record({ status: 'under_review' }));
  return requests;
}

function service(review: ReviewRepository = fakeReview(), requests = inReview()) {
  return new ReviewService(new IncrementRequestService(requests), review, () => NOW);
}

/** The notices a repository call would queue, given the context it passes. */
function noticesOf(mock: Mock, context: object): unknown {
  const call = mock.mock.calls[0] ?? [];
  // The input is the last argument: (scope, input) or (scope, requestId, input).
  const input = call.at(-1) as { notifications: (c: object) => unknown };
  return input.notifications(context);
}

describe('ReviewService.verify [R1-07, R1-10]', () => {
  it('ticks or unticks a criterion and tells the submitter when the stage moves', async () => {
    const review = fakeReview();
    const target = { requestId: REQUEST_ID, lineId: LINE_1, criterionId: CRITERION_1 };
    const dto = await service(review).verify(reviewer, target, true);
    expect(dto.id).toBe(REQUEST_ID);
    expect(review.verify).toHaveBeenCalledWith(scopeGroup, {
      ...target,
      verified: true,
      actorName: 'Reviewer',
      notifications: expect.any(Function) as unknown,
    });
    const context = {
      reference: 'INC-2026-0001',
      entityId: SUB_A,
      requestId: REQUEST_ID,
      submittedBy: 'alpha',
      criterion: 2,
      of: 5,
    };
    expect(noticesOf(review.verify, context)).toEqual([
      {
        recipient: { userId: 'alpha' },
        kind: 'stage_changed',
        entityId: SUB_A,
        requestId: REQUEST_ID,
        params: { reference: 'INC-2026-0001', criterion: 2, of: 5 },
      },
    ]);
    // A request submitted before submitters were kept has nobody to tell.
    expect(noticesOf(review.verify, { ...context, submittedBy: null })).toEqual([]);
    await service(review).verify(reviewer, target, false);
    expect(review.verify.mock.calls[1]?.[1]).toMatchObject({ verified: false });
  });

  it('turns a refusal into the API error', async () => {
    const review = fakeReview();
    review.verify.mockRejectedValueOnce(new RequestDataError('line_not_pending'));
    await expect(
      service(review).verify(
        reviewer,
        { requestId: REQUEST_ID, lineId: LINE_1, criterionId: CRITERION_1 },
        true,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('ReviewService.decide [R1-08, R1-09]', () => {
  const target = { requestId: REQUEST_ID, lineId: LINE_1 };
  const context = {
    reference: 'INC-2026-0001',
    entityId: SUB_A,
    requestId: REQUEST_ID,
    submittedBy: 'alpha',
    employeeName: 'Omar Haddad',
    requestStatus: 'under_review' as const,
  };

  it('approves as proposed and tells the submitter', async () => {
    const review = fakeReview();
    await service(review).decide(reviewer, target, { decision: 'approved' }, KEY);
    expect(review.decide).toHaveBeenCalledWith(scopeGroup, {
      ...target,
      idempotencyKey: KEY,
      decision: 'approved',
      reasonCode: null,
      comment: '',
      approved: null,
      actorName: 'Reviewer',
      notifications: expect.any(Function) as unknown,
    });
    expect(noticesOf(review.decide, context)).toEqual([
      {
        recipient: { userId: 'alpha' },
        entityId: SUB_A,
        requestId: REQUEST_ID,
        kind: 'employee_approved',
        params: { reference: 'INC-2026-0001', employee: 'Omar Haddad' },
        actionNeeded: false,
      },
    ]);
  });

  it('approves another percentage with its reason, normalised to 2 decimals', async () => {
    const review = fakeReview();
    await service(review).decide(
      reviewer,
      target,
      { decision: 'approved', approvedPercent: '4.5', reasonCode: 'budget', comment: 'Band.' },
      KEY,
    );
    expect(review.decide.mock.calls[0]?.[1]).toMatchObject({
      approved: { kind: 'percent', value: '4.50' },
      reasonCode: 'budget',
      comment: 'Band.',
    });
  });

  it('asks the subsidiary to act on a return, and announces a final status', async () => {
    const review = fakeReview();
    await service(review).decide(
      reviewer,
      target,
      { decision: 'returned', reasonCode: 'missing_evidence', comment: 'Add the appraisal.' },
      KEY,
    );
    expect(noticesOf(review.decide, { ...context, requestStatus: 'returned' })).toMatchObject([
      { kind: 'employee_returned', actionNeeded: true },
    ]);
    const rejecting = fakeReview();
    await service(rejecting).decide(
      reviewer,
      target,
      { decision: 'rejected', reasonCode: 'budget', comment: 'Over budget.' },
      KEY,
    );
    expect(noticesOf(rejecting.decide, { ...context, requestStatus: 'partly_approved' })).toEqual([
      expect.objectContaining({ kind: 'employee_rejected' }),
      {
        recipient: { userId: 'alpha' },
        entityId: SUB_A,
        requestId: REQUEST_ID,
        kind: 'request_decided',
        params: { reference: 'INC-2026-0001', status: 'partly_approved' },
      },
    ]);
    expect(
      noticesOf(rejecting.decide, { ...context, submittedBy: null, requestStatus: 'rejected' }),
    ).toEqual([]);
  });
});

describe('ReviewService.resubmit [R1-08]', () => {
  function returnedRequest(complete: boolean) {
    const base = record({ status: 'returned', version: 6 });
    const [omar, neha] = base.lines;
    if (omar === undefined || neha === undefined) throw new Error('fixture');
    omar.reviewStatus = 'returned';
    omar.criteria = base.criteria.map((criterion) => ({
      criterionId: criterion.id,
      result: 'pass',
      justification: 'Done.',
      evidence: complete
        ? [
            {
              id: criterion.id,
              fileName: 'a.pdf',
              mediaType: 'application/pdf',
              sizeBytes: 1,
              createdAt: NOW,
            },
          ]
        : [],
      verification: null,
    }));
    // Neha is still with Sirius HR: whatever she lacks doesn't block the resubmission.
    neha.reviewStatus = 'pending';
    return base;
  }

  it('sends the returned employees back once complete and tells the reviewers', async () => {
    const review = fakeReview();
    const requests = workingRepository();
    requests.get.mockResolvedValue(returnedRequest(true));
    await service(review, requests).resubmit(
      alphaHr,
      REQUEST_ID,
      { version: 6, note: 'Fixed.' },
      KEY,
    );
    expect(review.resubmit).toHaveBeenCalledWith(scopeA, REQUEST_ID, {
      version: 6,
      idempotencyKey: KEY,
      note: 'Fixed.',
      notifications: expect.any(Function) as unknown,
    });
    expect(
      noticesOf(review.resubmit, {
        reference: 'INC-2026-0001',
        entityId: SUB_A,
        requestId: REQUEST_ID,
        employees: 1,
      }),
    ).toEqual([
      {
        recipient: { role: 'PeopleForge.Reviewer' },
        kind: 'request_resubmitted',
        entityId: SUB_A,
        requestId: REQUEST_ID,
        params: { reference: 'INC-2026-0001', employees: 1, entity: 'SUB-A', actor: 'Alpha HR' },
        actionNeeded: true,
      },
    ]);
  });

  it('refuses returned employees that are incomplete; leaves replays to the repository', async () => {
    const requests = workingRepository();
    requests.get.mockResolvedValue(returnedRequest(false));
    const error: unknown = await service(fakeReview(), requests)
      .resubmit(alphaHr, REQUEST_ID, { version: 6, note: '' }, KEY)
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual([{ path: 'lines.0', code: 'incomplete' }]);
    // Back under review already (a replay): no check, the repository answers.
    const review = fakeReview();
    review.resubmit.mockResolvedValueOnce({ replayed: true });
    requests.get.mockResolvedValue(record({ status: 'under_review' }));
    await service(review, requests).resubmit(alphaHr, REQUEST_ID, { version: 6, note: '' }, KEY);
    expect(review.resubmit).toHaveBeenCalledOnce();
  });
});

describe('ReviewService.queue [R1-07]', () => {
  const queued = (overrides: Partial<QueueLineRecord> = {}): QueueLineRecord => ({
    lineId: LINE_1,
    request: {
      id: REQUEST_ID,
      reference: 'INC-2026-0001',
      status: 'under_review',
      entityId: SUB_A,
      entityCode: 'SUB-A',
      verifiedCriteria: 1,
    },
    employeeNumber: 'EMP-3318',
    fullName: 'Omar Haddad',
    grade: 'G7',
    currency: 'AED',
    currentSalary: '21500.00',
    proposedKind: 'amount',
    proposedValue: '1720.00',
    criteria: record().criteria,
    results: ['pass', 'fail', 'pass', null],
    verified: 2,
    reviewStatus: 'pending',
    waitingSince: new Date('2026-10-14T08:00:00Z'),
    ...overrides,
  });

  it('pages the queue with the reminder cut-off, percentages only and the stage', async () => {
    const review = fakeReview();
    review.queue.mockResolvedValueOnce({
      items: [
        queued(),
        queued({
          lineId: LINE_2,
          proposedKind: null,
          proposedValue: null,
          reviewStatus: 'returned',
          waitingSince: new Date('2026-10-01T08:00:00Z'),
        }),
        queued({ waitingSince: new Date('2026-10-16T08:00:00Z') }),
      ],
      total: 3,
      counts: {
        all: 9,
        pending: 2,
        returned: 1,
        overdue: 1,
        open: 3,
        openRequests: 2,
        openEntities: 1,
      },
    });
    const page = await service(review).queue(reviewer, {
      filter: 'pending',
      entityId: SUB_A,
      page: 2,
      pageSize: 10,
    });
    expect(review.queue).toHaveBeenCalledWith(scopeGroup, {
      filter: 'pending',
      entityId: SUB_A,
      // Two calendar days before now.
      overdueBefore: new Date('2026-10-15T08:00:00Z'),
      limit: 10,
      offset: 10,
    });
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 3, reminderDays: 2 });
    expect(page.counts.openEntities).toBe(1);
    const [omar, returned, recent] = page.items;
    expect(omar).toEqual({
      lineId: LINE_1,
      request: {
        id: REQUEST_ID,
        reference: 'INC-2026-0001',
        status: 'under_review',
        entity: { id: SUB_A, code: 'SUB-A' },
        stage: { kind: 'criterion', criterion: 2, of: 5 },
      },
      employeeNumber: 'EMP-3318',
      fullName: 'Omar Haddad',
      grade: 'G7',
      proposedPercent: '8.00',
      criteria: [
        { criterionId: CRITERION_IDS[0], code: 'C1', mark: 'pass' },
        { criterionId: CRITERION_IDS[1], code: 'C2', mark: 'fail' },
        { criterionId: CRITERION_IDS[2], code: 'C3', mark: 'pass' },
        { criterionId: CRITERION_IDS[3], code: 'C4', mark: 'pending' },
        { criterionId: CRITERION_IDS[4], code: 'C5', mark: 'pending' },
      ],
      verified: 2,
      reviewStatus: 'pending',
      waitingSince: '2026-10-14T08:00:00.000Z',
      overdue: true,
    });
    expect(JSON.stringify(page)).not.toContain('21500');
    // Returned employees wait on the subsidiary, never overdue for Sirius HR.
    expect(returned).toMatchObject({ proposedPercent: null, overdue: false });
    expect(recent?.overdue).toBe(false);
  });
});

describe('verifiedForAll [R1-10]', () => {
  it('counts criteria verified for every pending employee; all when none is pending', () => {
    const request = record({ status: 'under_review' });
    const [omar, neha] = request.lines;
    if (omar === undefined || neha === undefined) throw new Error('fixture');
    const verification = { verifiedAt: NOW, verifiedByName: 'Reviewer' };
    omar.criteria = request.criteria.map((criterion) => ({
      criterionId: criterion.id,
      result: 'pass',
      justification: 'x',
      evidence: [],
      verification,
    }));
    expect(verifiedForAll(request)).toBe(0);
    neha.criteria = [
      { criterionId: CRITERION_1, result: 'pass', justification: 'x', evidence: [], verification },
    ];
    expect(verifiedForAll(request)).toBe(1);
    neha.reviewStatus = 'approved';
    expect(verifiedForAll(request)).toBe(5);
    omar.reviewStatus = 'returned';
    expect(verifiedForAll(request)).toBe(5);
  });
});

// Keeps the shared fake honest: every method refuses until a test replaces it.
describe('unusedReview', () => {
  it('fails loudly', async () => {
    await expect(unusedReview.queue({ userId: 'x', kind: 'group' }, {} as never)).rejects.toThrow();
  });
});
