import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import {
  decisionOf,
  LINE_1,
  LINE_2,
  must,
  queueItem,
  queuePage,
  REQUEST_ID,
  submittedRequest,
  VERIFIED,
} from '@/test-support/requests';
import {
  decisionPanelLabels,
  decisionSummary,
  inReview,
  nextPending,
  queueChips,
  queueHref,
  queueRows,
  queueState,
  reasonOptions,
  remainingDecisionLabels,
  unverified,
  verificationView,
  waitingLines,
  type QueueState,
} from './review-view';

const t = createTranslator('en');
const DEFAULT: QueueState = { filter: 'pending', page: 1, pageSize: 10 };
const ENTITY = '00000000-0000-4000-8000-0000000e000b';

describe('queueState / queueHref [R1-07]', () => {
  it('reads the queue’s URL, falling back to defaults, and links back to it', () => {
    expect(queueState({})).toEqual({ ...DEFAULT, entity: undefined, search: undefined });
    const state = queueState({
      filter: 'overdue',
      entity: ENTITY,
      q: ' Aisha ',
      page: ['3', '9'],
      size: '25',
    });
    expect(state).toEqual({
      filter: 'overdue',
      entity: ENTITY,
      search: 'Aisha',
      page: 3,
      pageSize: 25,
    });
    expect(queueHref(DEFAULT)).toBe('/review');
    expect(queueHref(state, { page: 2 })).toBe(
      `/review?filter=overdue&entity=${ENTITY}&q=Aisha&page=2&size=25`,
    );
    expect(
      queueState({ filter: 'mine', entity: 'SUB-A', q: 'x'.repeat(101), page: '0', size: '7' }),
    ).toEqual({
      ...DEFAULT,
      entity: undefined,
      search: undefined,
    });
  });
});

describe('queueChips', () => {
  it('gives every filter its count, link and whether it is chosen', () => {
    const chips = queueChips(queuePage(), DEFAULT, t);
    expect(chips.map((chip) => [chip.label, chip.count, chip.active])).toEqual([
      ['To review', 3, true],
      ['Returned', 1, false],
      ['Past reminder', 1, false],
      ['All open', 4, false],
      ['All', 6, false],
    ]);
    expect(chips[1]?.href).toBe('/review?filter=returned');
  });
});

describe('queueRows', () => {
  it('words each employee waiting, flagging those past the reminder time', () => {
    const now = new Date('2026-10-17T08:00:00Z');
    const [omar, returned] = queueRows(
      queuePage([
        queueItem(),
        queueItem({
          lineId: LINE_2,
          fullName: 'Neha Iyer',
          proposedPercent: null,
          reviewStatus: 'returned',
          overdue: false,
        }),
      ]),
      now,
      'en',
      t,
    );
    expect(omar).toEqual({
      id: LINE_1,
      href: `/requests/${REQUEST_ID}/employees/${LINE_1}`,
      name: 'Omar Haddad',
      detail: 'EMP-3318 · G7',
      request: 'INC-2026-0152',
      entityCode: 'SUB-A',
      stage: 'Criterion 2 of 5',
      proposed: '8%',
      marks: [
        { code: 'C1', state: 'pass' },
        { code: 'C2', state: 'fail' },
        { code: 'C3', state: 'pass' },
        { code: 'C4', state: 'pass' },
        { code: 'C5', state: 'pass' },
      ],
      marksLabel: 'C1 pass, C2 fail, C3 pass, C4 pass, C5 pass',
      verified: '2 of 5',
      waiting: '3d',
      overdue: 'Past 2-day reminder',
      status: { tone: 'info', label: 'To review' },
      action: 'Review',
      actionLabel: 'Review Omar Haddad',
    });
    expect(returned).toMatchObject({
      proposed: 'Not proposed',
      overdue: null,
      status: { tone: 'warning', label: 'Returned' },
      action: 'View',
      actionLabel: 'View Neha Iyer',
    });
  });
});

describe('one employee in review [R1-07 … R1-09]', () => {
  const request = submittedRequest({ status: 'under_review' });
  const omar = must(request.lines[0]);

  it('knows whether Sirius HR can still act on the employee', () => {
    expect(inReview(request, omar)).toBe(true);
    expect(inReview({ ...request, status: 'returned' }, omar)).toBe(true);
    expect(inReview({ ...request, status: 'submitted' }, omar)).toBe(true);
    expect(inReview({ ...request, status: 'approved' }, omar)).toBe(false);
    expect(inReview(request, { ...omar, reviewStatus: 'returned' })).toBe(false);
  });

  it('counts what is left to verify and finds the next employee to review', () => {
    expect(unverified(omar)).toBe(5);
    const checked = {
      ...omar,
      criteria: omar.criteria.map((criterion) => ({ ...criterion, verification: VERIFIED })),
    };
    expect(unverified(checked)).toBe(0);
    expect(nextPending(request, LINE_1)?.id).toBe(LINE_2);
    // Wraps round to earlier employees.
    expect(nextPending(request, LINE_2)?.id).toBe(LINE_1);
    const decided = {
      ...request,
      lines: request.lines.map((line) =>
        line.id === LINE_2 ? { ...line, reviewStatus: 'approved' as const } : line,
      ),
    };
    expect(nextPending(decided, LINE_1)).toBeUndefined();
  });

  it('says who verified a criterion, or offers to', () => {
    const criterionId = must(omar.criteria[0]).criterionId;
    expect(verificationView(omar, criterionId, 'C1', 'en', t)).toEqual({
      verified: false,
      text: 'Not verified',
      button: 'Mark verified',
      buttonLabel: 'Mark C1 verified for Omar Haddad',
    });
    const checked = {
      ...omar,
      criteria: omar.criteria.map((criterion) => ({ ...criterion, verification: VERIFIED })),
    };
    expect(verificationView(checked, criterionId, 'C1', 'en', t)).toEqual({
      verified: true,
      text: 'Verified by Sara Al Mansoori, 16 Oct 2026',
      button: 'Undo',
      buttonLabel: 'Undo the check of C1 for Omar Haddad',
    });
    expect(verificationView(omar, 'unknown', 'C9', 'en', t).verified).toBe(false);
  });

  it('offers the reasons per decision and words the panel', () => {
    const reasons = reasonOptions(t);
    expect(reasons.approved.map((reason) => reason.label)).toEqual([
      'Budget',
      'Policy band',
      'Internal equity',
      'Other',
    ]);
    expect(reasons.returned[0]).toEqual({ value: 'missing_evidence', label: 'Missing evidence' });
    const labels = decisionPanelLabels(omar, 'en', t);
    expect(labels.confirm.returned).toBe('Return Omar Haddad');
    expect(labels.approvedPercentHint).toBe('Proposed: 8%');
    expect(labels.verifyFirst).toBe('Verify 5 more criteria before approving.');
    const one = {
      ...omar,
      percent: null,
      criteria: omar.criteria.map((criterion, index) => ({
        ...criterion,
        verification: index === 0 ? null : VERIFIED,
      })),
    };
    expect(decisionPanelLabels(one, 'en', t)).toMatchObject({
      verifyFirst: 'Verify 1 more criterion before approving.',
      approvedPercentHint: 'Proposed: Not set',
    });
    expect(
      decisionPanelLabels(
        {
          ...omar,
          criteria: omar.criteria.map((criterion) => ({ ...criterion, verification: VERIFIED })),
        },
        'en',
        t,
      ).verifyFirst,
    ).toBeNull();
  });
});

describe('decide all remaining [R1-09]', () => {
  const request = submittedRequest({ status: 'under_review' });
  const verify = (line: (typeof request.lines)[number]) => ({
    ...line,
    criteria: line.criteria.map((criterion) => ({ ...criterion, verification: VERIFIED })),
  });

  it('counts the employees still waiting, and those not yet fully verified', () => {
    const omar = must(request.lines[0]);
    const second = must(request.lines[1]);
    const mixed = {
      ...request,
      lines: [
        verify(omar),
        second,
        { ...omar, id: 'decided-line', reviewStatus: 'approved' as const },
      ],
    };
    expect(waitingLines(mixed).map((line) => line.id)).toEqual([LINE_1, second.id]);
    const labels = remainingDecisionLabels(mixed, 'en', t);
    expect(labels.confirm).toEqual({
      approved: 'Approve all 2',
      rejected: 'Reject all 2',
      returned: 'Return all 2',
    });
    expect(labels.verifyFirst).toBe(
      'Verify every criterion of 1 more employee before approving all.',
    );
    expect(labels.changeIncrement).toBe('');
    expect(remainingDecisionLabels({ ...request, lines: request.lines }, 'en', t).verifyFirst).toBe(
      `Verify every criterion of ${String(request.lines.length)} more employees before approving all.`,
    );
    expect(
      remainingDecisionLabels({ ...request, lines: request.lines.map(verify) }, 'en', t)
        .verifyFirst,
    ).toBeNull();
  });
});

describe('decisionSummary [R1-09]', () => {
  const request = submittedRequest({ status: 'partly_approved' });
  const omar = must(request.lines[0]);

  it('is nothing while undecided', () => {
    expect(decisionSummary(request, omar, 'en', t)).toBeNull();
  });

  it('words an approval as proposed, or at another percentage', () => {
    const asProposed = decisionSummary(request, { ...omar, decision: decisionOf() }, 'en', t);
    expect(asProposed).toMatchObject({
      tone: 'success',
      title: 'Approved',
      reason: '',
      comment: '',
      by: 'By Sara Al Mansoori · 16 Oct 2026, 12:30',
    });
    expect(asProposed?.body).toMatch(/^Approved as proposed: 8% \(\+ AED\s1,720 per month\)\.$/u);
    const changed = decisionSummary(
      request,
      {
        ...omar,
        decision: decisionOf({
          reasonCode: 'budget',
          comment: 'Within the band.',
          approvedPercent: '4.50',
          approvedIncrease: '967.50',
          approvedSalary: '22467.50',
        }),
      },
      'en',
      t,
    );
    expect(changed?.body).toMatch(/^Approved at 4\.5% instead of 8%/u);
    expect(changed).toMatchObject({ reason: 'Reason: Budget', comment: 'Within the band.' });
    const unknownProposal = decisionSummary(
      request,
      {
        ...omar,
        percent: null,
        decision: decisionOf({ approvedIncrease: null, approvedPercent: '5.00' }),
      },
      'en',
      t,
    );
    expect(unknownProposal?.body).toContain('instead of —');
    expect(
      decisionSummary(
        request,
        { ...omar, percent: null, decision: decisionOf({ approvedIncrease: null }) },
        'en',
        t,
      )?.body,
    ).toBe('Approved as proposed: — (+ — per month).');
  });

  it('words a rejection and a return with Sirius HR’s question', () => {
    expect(
      decisionSummary(
        request,
        { ...omar, decision: decisionOf({ decision: 'rejected', reasonCode: 'budget' }) },
        'en',
        t,
      ),
    ).toMatchObject({
      tone: 'danger',
      title: 'Rejected',
      body: 'No increment for this employee in this cycle.',
    });
    expect(
      decisionSummary(
        request,
        {
          ...omar,
          decision: decisionOf({
            decision: 'returned',
            reasonCode: 'missing_evidence',
            comment: 'Attach the appraisal.',
          }),
        },
        'en',
        t,
      ),
    ).toMatchObject({
      tone: 'warning',
      title: 'Returned to Subsidiary A',
      body: 'Sirius HR asks',
      reason: 'Reason: Missing evidence',
      comment: 'Attach the appraisal.',
    });
  });
});
