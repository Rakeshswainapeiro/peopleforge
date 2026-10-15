import {
  type DashboardFilter,
  type DashboardSummary,
  type IncrementRequestPage,
  type ListIncrementRequestsQuery,
  type ListRequestLinesQuery,
  type RequestLinePage,
  type RequestStage,
  type RequestStatus,
} from '@peopleforge/contracts';
import type {
  DashboardLineRecord,
  DashboardRepository,
  DashboardRequestRecord,
} from '@peopleforge/db';
import { scopeOf, type Principal } from '../../auth/principal.js';
import { markOf, missingFor, withFacts } from './criteria.js';
import { seesDrafts } from './increment-request.service.js';
import { lineFigures } from './money.js';

/**
 * Where a request stands (R1-10). Until Sirius HR's per-criterion review exists (S5), a
 * submitted request waits at the first criterion, as the Figma shows (Q7 open).
 */
export function stageOf(status: RequestStatus, criteriaCount: number): RequestStage {
  const of = Math.max(criteriaCount, 1);
  return status === 'draft'
    ? { kind: 'not_submitted', of }
    : { kind: 'criterion', criterion: 1, of };
}

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

function toRequestSummary(record: DashboardRequestRecord): IncrementRequestPage['items'][number] {
  return {
    id: record.id,
    reference: record.reference,
    status: record.status,
    entity: record.entity,
    cycleId: record.cycleId,
    employeeCount: record.lines.length,
    createdAt: record.createdAt.toISOString(),
    statusChangedAt: record.statusChangedAt.toISOString(),
    stage: stageOf(record.status, record.criteria.length),
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
      } satisfies Record<RequestStatus, number>,
      requests: record.requests,
      employees: record.employees,
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
