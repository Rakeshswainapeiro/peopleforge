import { describe, expect, it } from 'vitest';
import { SUB_A } from '../../test-support/factory.js';
import {
  alphaHr,
  CRITERION_IDS,
  CYCLE_ID,
  dashboardLine,
  dashboardRequest,
  LINE_1,
  REQUEST_ID,
  reviewer,
  workingDashboard,
} from '../../test-support/increment-requests.js';
import { DashboardService, stageFunnel } from './dashboard.service.js';

const scopeA = { userId: 'alpha', userName: 'Alpha HR', kind: 'entity', entityIds: [SUB_A] };
const scopeGroup = { userId: 'reviewer', userName: 'Reviewer', kind: 'group' };

describe('DashboardService.summary', () => {
  it('counts every status (zero when none) in the caller’s scope, drafts only for preparers', async () => {
    const repository = workingDashboard();
    const service = new DashboardService(repository);
    await expect(service.summary(alphaHr, { cycleId: CYCLE_ID, search: 'omar' })).resolves.toEqual({
      byStatus: {
        draft: 2,
        submitted: 0,
        under_review: 0,
        returned: 0,
        approved: 0,
        partly_approved: 0,
        rejected: 0,
      },
      requests: 2,
      employees: 3,
      funnel: { criteria: [], decision: 0, withSubsidiary: 0, decided: 0 },
    });
    repository.summary.mockResolvedValueOnce({
      byStatus: { submitted: 4, partly_approved: 1 },
      requests: 4,
      employees: 9,
      stages: [{ status: 'partly_approved', criteria: 5, verified: 5, waiting: 0 }],
    });
    await expect(service.summary(reviewer, {})).resolves.toEqual({
      byStatus: {
        draft: 0,
        submitted: 4,
        under_review: 0,
        returned: 0,
        approved: 0,
        partly_approved: 1,
        rejected: 0,
      },
      requests: 4,
      employees: 9,
      funnel: { criteria: [0, 0, 0, 0, 0], decision: 0, withSubsidiary: 0, decided: 1 },
    });
    expect(repository.summary.mock.calls).toEqual([
      [scopeA, { cycleId: CYCLE_ID, search: 'omar', includeDrafts: true }],
      [scopeGroup, { includeDrafts: false }],
    ]);
  });
});

describe('stageFunnel [DASH-D2, R1-10]', () => {
  it('places each submitted request at its stage, as long as the longest criteria set', () => {
    expect(
      stageFunnel([
        { status: 'submitted', criteria: 5, verified: 0, waiting: 2 },
        { status: 'under_review', criteria: 5, verified: 2, waiting: 1 },
        { status: 'under_review', criteria: 5, verified: 2, waiting: 1 },
        // Partly returned: the employees still waiting are at their stage.
        { status: 'returned', criteria: 3, verified: 3, waiting: 1 },
        { status: 'under_review', criteria: 4, verified: 4, waiting: 2 },
        { status: 'approved', criteria: 5, verified: 0, waiting: 0 },
        { status: 'rejected', criteria: 5, verified: 5, waiting: 0 },
      ]),
    ).toEqual({ criteria: [1, 0, 2, 0, 0], decision: 2, withSubsidiary: 0, decided: 2 });
    expect(stageFunnel([])).toEqual({ criteria: [], decision: 0, withSubsidiary: 0, decided: 0 });
  });

  it('counts a request whose every remaining employee is back with the subsidiary apart', () => {
    // Nobody waits for Sirius HR: "every criterion verified" would be vacuously true.
    expect(stageFunnel([{ status: 'returned', criteria: 5, verified: 5, waiting: 0 }])).toEqual({
      criteria: [0, 0, 0, 0, 0],
      decision: 0,
      withSubsidiary: 1,
      decided: 0,
    });
  });
});

describe('DashboardService.requests', () => {
  it('pages requests with employee count, criteria progress and stage', async () => {
    const repository = workingDashboard();
    const page = await new DashboardService(repository).requests(alphaHr, {
      cycleId: CYCLE_ID,
      status: 'draft',
      order: 'oldest',
      page: 3,
      pageSize: 10,
    });
    expect(repository.requests).toHaveBeenCalledWith(scopeA, {
      cycleId: CYCLE_ID,
      status: 'draft',
      order: 'oldest',
      includeDrafts: true,
      limit: 10,
      offset: 20,
    });
    expect(page).toEqual({
      page: 3,
      pageSize: 10,
      total: 1,
      items: [
        {
          id: REQUEST_ID,
          reference: 'INC-2026-0001',
          status: 'draft',
          entity: { id: SUB_A, code: 'SUB-A' },
          cycleId: CYCLE_ID,
          employeeCount: 2,
          createdAt: '2026-10-14T07:00:00.000Z',
          submittedAt: null,
          statusChangedAt: '2026-10-14T07:00:00.000Z',
          stage: { kind: 'not_submitted', of: 5 },
          // Omar's C1 is complete; nothing else of the 2 × 5.
          criteria: { complete: 1, total: 10 },
        },
      ],
    });
  });

  it('shows Sirius the stage: the first criterion not verified for everyone [R1-10]', async () => {
    const repository = workingDashboard();
    repository.requests.mockResolvedValueOnce({
      items: [
        dashboardRequest({
          status: 'under_review',
          lines: [],
          submittedAt: new Date('2026-10-15T07:14:00Z'),
          verifiedCriteria: 2,
        }),
      ],
      total: 1,
    });
    const page = await new DashboardService(repository).requests(reviewer, {
      order: 'newest',
      page: 1,
      pageSize: 25,
    });
    expect(repository.requests).toHaveBeenCalledWith(scopeGroup, {
      order: 'newest',
      includeDrafts: false,
      limit: 25,
      offset: 0,
    });
    expect(page.items[0]).toMatchObject({
      submittedAt: '2026-10-15T07:14:00.000Z',
      stage: { kind: 'criterion', criterion: 3, of: 5 },
      employeeCount: 0,
      criteria: { complete: 0, total: 0 },
    });
  });
});

describe('DashboardService.lines', () => {
  it('gives each employee a proposed percentage (never the salary) and ✓/✗/○ per criterion', async () => {
    const repository = workingDashboard();
    const page = await new DashboardService(repository).lines(alphaHr, {
      requestId: REQUEST_ID,
      page: 1,
      pageSize: 10,
    });
    expect(repository.lines).toHaveBeenCalledWith(scopeA, {
      requestId: REQUEST_ID,
      includeDrafts: true,
      limit: 10,
      offset: 0,
    });
    const [line] = page.items;
    expect(line).toEqual({
      id: LINE_1,
      request: { id: REQUEST_ID, reference: 'INC-2026-0001', status: 'draft', entityCode: 'SUB-A' },
      employeeNumber: 'EMP-3318',
      fullName: 'Omar Haddad',
      grade: 'G7',
      // AED 1,720 of AED 21,500.
      proposedPercent: '8.00',
      criteria: [
        // Passed, but its required file is missing: not complete yet.
        { criterionId: CRITERION_IDS[0], code: 'C1', mark: 'pending' },
        { criterionId: CRITERION_IDS[1], code: 'C2', mark: 'fail' },
        { criterionId: CRITERION_IDS[2], code: 'C3', mark: 'pending' },
        { criterionId: CRITERION_IDS[3], code: 'C4', mark: 'pending' },
        { criterionId: CRITERION_IDS[4], code: 'C5', mark: 'pending' },
      ],
      status: 'draft',
      reviewStatus: 'pending',
      updatedAt: '2026-10-14T07:05:00.000Z',
    });
    expect(JSON.stringify(page)).not.toContain('21500');
  });

  it('shows a percentage proposal as given, and none before one is made', async () => {
    const repository = workingDashboard();
    repository.lines.mockResolvedValueOnce({
      items: [
        dashboardLine({ proposedKind: 'percent', proposedValue: '5.50' }),
        dashboardLine({ proposedKind: null, proposedValue: null }),
      ],
      total: 2,
    });
    const page = await new DashboardService(repository).lines(alphaHr, { page: 1, pageSize: 10 });
    expect(page.items.map((item) => item.proposedPercent)).toEqual(['5.50', null]);
  });
});
