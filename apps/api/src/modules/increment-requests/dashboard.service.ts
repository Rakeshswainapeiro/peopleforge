import {
  FINAL_STATUSES,
  type DashboardFilter,
  type DashboardSummary,
  type IncrementRequestPage,
  type ListIncrementRequestsQuery,
  type ListRequestLinesQuery,
  type RequestLinePage,
  type RequestStatus,
} from '@peopleforge/contracts';
import type {
  DashboardLineRecord,
  DashboardRepository,
  DashboardRequestRecord,
  DashboardSummaryRecord,
} from '@peopleforge/db';
import { scopeOf, type Principal } from '../../auth/principal.js';
import { markOf, missingFor, withFacts } from './criteria.js';
import { seesDrafts } from './increment-request.service.js';
import { lineFigures } from './money.js';
import { stageOf } from './stage.js';

function completeCriteria(record: DashboardRequestRecord): number {
  return record.lines.reduce(
    (count, facts) =>
      count +
      withFacts(record.criteria, facts).filter(
        (entry) => missingFor(entry.criterion, entry.facts).length === 0,
      ).length,
    0,
  );
}

/**
 * The stage funnel (DASH-D2): how many submitted requests are at each criterion, at the
 * decision, and decided, by the same rule as each request's stage (R1-10).
 */
export function stageFunnel(stages: DashboardSummaryRecord['stages']): DashboardSummary['funnel'] {
  // A request still open with nobody waiting for Sirius HR is back with the subsidiary: its
  // stage would otherwise read "every criterion verified" (vacuously, for no employee).
  const withSubsidiary = (stage: DashboardSummaryRecord['stages'][number]) =>
    !FINAL_STATUSES.includes(stage.status) && stage.waiting === 0;
  const placed = stages
    .filter((stage) => !withSubsidiary(stage))
    .map((stage) => stageOf(stage.status, stage.criteria, stage.verified));
  const longest = Math.max(0, ...stages.map((stage) => stage.criteria));
  return {
    criteria: Array.from(
      { length: longest },
      (_, index) =>
        placed.filter((stage) => stage.kind === 'criterion' && stage.criterion === index + 1)
          .length,
    ),
    decision: placed.filter((stage) => stage.kind === 'decision').length,
    withSubsidiary: stages.filter(withSubsidiary).length,
    decided: placed.filter((stage) => stage.kind === 'decided').length,
  };
}

function toRequestSummary(record: DashboardRequestRecord): IncrementRequestPage['items'][number] {
  return {
    id: record.id,
    reference: record.reference,
    status: record.status,
    entity: record.entity,
    cycleId: record.cycleId,
    employeeCount: record.lines.length,
    createdAt: record.createdAt.toISOString(),
    submittedAt: record.submittedAt === null ? null : record.submittedAt.toISOString(),
    statusChangedAt: record.statusChangedAt.toISOString(),
    stage: stageOf(record.status, record.criteria.length, record.verifiedCriteria),
    criteria: {
      complete: completeCriteria(record),
      total: record.lines.length * record.criteria.length,
    },
  };
}

function toLineSummary(record: DashboardLineRecord): RequestLinePage['items'][number] {
  const figures = lineFigures(record.currentSalary, record.proposedKind, record.proposedValue);
  return {
    id: record.id,
    request: {
      id: record.request.id,
      reference: record.request.reference,
      status: record.request.status,
      entityCode: record.request.entityCode,
    },
    employeeNumber: record.employeeNumber,
    fullName: record.fullName,
    grade: record.grade,
    // Lists carry the percentage only, never the salary (data minimisation, NFR-PRIV-01).
    proposedPercent: figures?.percent ?? null,
    criteria: withFacts(record.criteria, record.facts).map(({ criterion, facts }) => ({
      criterionId: criterion.id,
      code: criterion.code,
      mark: markOf(facts.result, missingFor(criterion, facts)),
    })),
    status: record.request.status,
    reviewStatus: record.reviewStatus,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * "My increment requests" (R1-10, DASH-D1): counts, requests and employees for the caller's
 * subsidiaries (Row-Level Security) or, for Sirius HR, every subsidiary's submitted requests.
 */
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async summary(caller: Principal, filter: DashboardFilter): Promise<DashboardSummary> {
    const record = await this.repository.summary(scopeOf(caller), {
      ...filter,
      includeDrafts: seesDrafts(caller),
    });
    return {
      // Every status, zero when none, so the cards never guess. A new status fails to compile
      // here until it is counted.
      byStatus: {
        draft: record.byStatus.draft ?? 0,
        submitted: record.byStatus.submitted ?? 0,
        under_review: record.byStatus.under_review ?? 0,
        returned: record.byStatus.returned ?? 0,
        approved: record.byStatus.approved ?? 0,
        partly_approved: record.byStatus.partly_approved ?? 0,
        rejected: record.byStatus.rejected ?? 0,
      } satisfies Record<RequestStatus, number>,
      requests: record.requests,
      employees: record.employees,
      funnel: stageFunnel(record.stages),
    };
  }

  async requests(
    caller: Principal,
    query: ListIncrementRequestsQuery,
  ): Promise<IncrementRequestPage> {
    const { page, pageSize, ...filter } = query;
    const { items, total } = await this.repository.requests(scopeOf(caller), {
      ...filter,
      includeDrafts: seesDrafts(caller),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { page, pageSize, total, items: items.map(toRequestSummary) };
  }

  async lines(caller: Principal, query: ListRequestLinesQuery): Promise<RequestLinePage> {
    const { page, pageSize, ...filter } = query;
    const { items, total } = await this.repository.lines(scopeOf(caller), {
      ...filter,
      includeDrafts: seesDrafts(caller),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { page, pageSize, total, items: items.map(toLineSummary) };
  }
}
