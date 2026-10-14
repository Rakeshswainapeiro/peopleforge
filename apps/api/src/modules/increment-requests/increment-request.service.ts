import type {
  CreateIncrementRequest,
  Cycle,
  EmployeeOption,
  IncrementRequest,
  IncrementRequestPage,
  RemoveLineResult,
  RequestStatus,
  SaveDraft,
} from '@peopleforge/contracts';
import {
  RequestDataError,
  type IncrementRequestRecord,
  type IncrementRequestRepository,
} from '@peopleforge/db';
import { permissionsOfPrincipal, scopeOf, type Principal } from '../../auth/principal.js';
import type { DomainError } from '../../errors/domain-errors.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../errors/domain-errors.js';
import { assessmentOf, effectiveMaxFileMb, missingFor } from './criteria.js';
import { lineFigures, proposalProblem, requestTotals, toMoney } from './money.js';

/** Most employees one search returns; the picker narrows by typing. */
export const EMPLOYEE_SEARCH_LIMIT = 50;

/** Maps an expected data-layer refusal to the API error a client sees. */
export function toDomainError(error: RequestDataError): DomainError {
  switch (error.reason) {
    case 'not_found':
      return new NotFoundError('Increment request not found');
    case 'line_not_found':
      return new NotFoundError('Request line not found', [{ path: 'lineId', code: 'not_found' }]);
    case 'version_conflict':
      return new ConflictError('Request changed since it was read', [
        { path: 'version', code: 'stale' },
      ]);
    case 'duplicate_employee':
      return new ConflictError('Employee already in the request', [
        { path: 'employeeId', code: 'duplicate' },
      ]);
    case 'employee_not_found':
      return new ValidationError('Unknown employee', [{ path: 'employeeId', code: 'not_found' }]);
    case 'cycle_not_open':
      return new ValidationError('Cycle not open', [{ path: 'cycleId', code: 'not_open' }]);
    case 'entity_not_found':
      return new ValidationError('Unknown subsidiary', [{ path: 'entityId', code: 'not_found' }]);
    case 'no_active_criteria':
      return new ConflictError('No active criteria set', [
        { path: 'criteria', code: 'none_active' },
      ]);
    case 'criterion_not_found':
      return new ValidationError('Unknown criterion', [{ path: 'criterionId', code: 'not_found' }]);
    case 'evidence_limit':
      return new ConflictError('Too many files for this criterion', [
        { path: 'file', code: 'limit' },
      ]);
    case 'evidence_not_found':
      return new NotFoundError('Evidence not found');
  }
}

/** Runs a data-layer call, turning its expected refusals into API errors. */
export async function guard<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error: unknown) {
    throw error instanceof RequestDataError ? toDomainError(error) : error;
  }
}

/** A subsidiary user may only act for their own subsidiaries (R1-01); Sirius roles for any. */
function assertActsFor(caller: Principal, entityId: string): void {
  if (caller.scope === 'entity' && !caller.entityIds.includes(entityId)) {
    throw new ForbiddenError('Not your subsidiary');
  }
}

function resolveEntity(caller: Principal, requested: string | undefined): string {
  if (requested !== undefined) {
    assertActsFor(caller, requested);
    return requested;
  }
  if (caller.scope === 'entity' && caller.entityIds.length === 1)
    return String(caller.entityIds[0]);
  throw new ValidationError('Choose a subsidiary', [{ path: 'entityId', code: 'required' }]);
}

/** Drafts belong to the subsidiary preparing them; Sirius sees a request once it is submitted. */
function seesDrafts(caller: Principal): boolean {
  return permissionsOfPrincipal(caller).has('increment_request:create');
}

/** Widened to string: more statuses arrive with submission (S4). */
function isDraft(status: string): boolean {
  return status === 'draft';
}

/** Whether the caller may see a request in this status (their scope is enforced by RLS). */
export function canSee(caller: Principal, status: string): boolean {
  return !isDraft(status) || seesDrafts(caller);
}

function toDto(record: IncrementRequestRecord): IncrementRequest {
  const lines = record.lines.map((line) => {
    const figures = lineFigures(line.currentSalary, line.proposedKind, line.proposedValue);
    const criteria = record.criteria.map((criterion) => {
      const assessment = assessmentOf(criterion, line.criteria);
      return {
        criterionId: criterion.id,
        result: assessment.result,
        justification: assessment.justification,
        evidence: assessment.evidence.map((file) => ({
          ...file,
          createdAt: file.createdAt.toISOString(),
        })),
        missing: missingFor(criterion, assessment),
      };
    });
    return {
      line: {
        id: line.id,
        employeeId: line.employeeId,
        employeeNumber: line.employeeNumber,
        fullName: line.fullName,
        grade: line.grade,
        currency: line.currency,
        currentSalary: line.currentSalary,
        proposedKind: line.proposedKind,
        proposedValue: line.proposedValue,
        increase: figures?.increase ?? null,
        newSalary: figures?.newSalary ?? null,
        percent: figures?.percent ?? null,
        criteria,
      },
      totalsInput: {
        currency: line.currency,
        figures,
        complete: criteria.every((criterion) => criterion.missing.length === 0),
      },
    };
  });
  return {
    id: record.id,
    reference: record.reference,
    status: record.status,
    entity: record.entity,
    cycle: record.cycle,
    criteria: record.criteria.map((criterion) => ({
      ...criterion,
      maxFileMb: effectiveMaxFileMb(criterion),
    })),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lines: lines.map((entry) => entry.line),
    totals: requestTotals(lines.map((entry) => entry.totalsInput)),
  };
}

/**
 * Increment request use cases (R1-02). Authorisation: the route checks the permission; this
 * checks the subsidiary; Row-Level Security re-checks every row (ADR-002).
 */
export class IncrementRequestService {
  constructor(private readonly repository: IncrementRequestRepository) {}

  openCycles(caller: Principal): Promise<Cycle[]> {
    return this.repository.openCycles(scopeOf(caller));
  }

  searchEmployees(
    caller: Principal,
    query: { entityId: string; search?: string | undefined; excludeRequestId?: string | undefined },
  ): Promise<EmployeeOption[]> {
    assertActsFor(caller, query.entityId);
    return this.repository.searchEmployees(scopeOf(caller), {
      entityId: query.entityId,
      limit: EMPLOYEE_SEARCH_LIMIT,
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(query.excludeRequestId === undefined ? {} : { excludeRequestId: query.excludeRequestId }),
    });
  }

  async create(
    caller: Principal,
    input: CreateIncrementRequest,
    idempotencyKey: string,
  ): Promise<IncrementRequest> {
    const entityId = resolveEntity(caller, input.entityId);
    const { id } = await guard(
      this.repository.create(scopeOf(caller), {
        entityId,
        cycleId: input.cycleId,
        employeeIds: [...new Set(input.employeeIds)],
        idempotencyKey,
      }),
    );
    return this.get(caller, id);
  }

  async get(caller: Principal, id: string): Promise<IncrementRequest> {
    const record = await this.repository.get(scopeOf(caller), id);
    if (record === null || !canSee(caller, record.status)) {
      throw new NotFoundError('Increment request not found');
    }
    return toDto(record);
  }

  async list(
    caller: Principal,
    query: { status?: RequestStatus | undefined; page: number; pageSize: number },
  ): Promise<IncrementRequestPage> {
    const { items, total } = await this.repository.list(scopeOf(caller), {
      includeDrafts: seesDrafts(caller),
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      ...(query.status === undefined ? {} : { status: query.status }),
    });
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async addLine(caller: Principal, id: string, employeeId: string): Promise<IncrementRequest> {
    await guard(this.repository.addLine(scopeOf(caller), id, employeeId));
    return this.get(caller, id);
  }

  /** Removing the last employee discards the draft; the result says so (no request returned). */
  async removeLine(caller: Principal, id: string, lineId: string): Promise<RemoveLineResult> {
    const { discarded } = await guard(this.repository.removeLine(scopeOf(caller), id, lineId));
    return discarded
      ? { discarded, request: null }
      : { discarded, request: await this.get(caller, id) };
  }

  /**
   * "Save draft": the proposed increments and, optionally, one employee's criteria (R1-02,
   * R1-03), all or nothing.
   */
  async saveDraft(caller: Principal, id: string, input: SaveDraft): Promise<IncrementRequest> {
    const current = await this.get(caller, id);
    const salaries = new Map(current.lines.map((line) => [line.id, line.currentSalary]));
    const criterionIds = new Set(current.criteria.map((criterion) => criterion.id));
    const assessmentProblems =
      input.assessment === undefined
        ? []
        : [
            ...(salaries.has(input.assessment.lineId)
              ? []
              : [{ path: 'assessment.lineId', code: 'not_found' }]),
            ...input.assessment.results.flatMap((result, index) =>
              criterionIds.has(result.criterionId)
                ? []
                : [{ path: `assessment.results.${String(index)}.criterionId`, code: 'not_found' }],
            ),
          ];
    const proposalProblems = input.proposals.flatMap((proposal, index) => {
      const salary = salaries.get(proposal.lineId);
      if (salary === undefined)
        return [{ path: `proposals.${String(index)}.lineId`, code: 'not_found' }];
      if (proposal.kind === null || proposal.value === null) return [];
      const problem = proposalProblem(salary, proposal.kind, proposal.value);
      return problem === null ? [] : [{ path: `proposals.${String(index)}.value`, code: problem }];
    });
    const problems = [...proposalProblems, ...assessmentProblems];
    if (problems.length > 0) throw new ValidationError('Invalid draft', problems);
    await guard(
      this.repository.saveDraft(scopeOf(caller), id, {
        version: input.version,
        proposals: input.proposals.map((proposal) => ({
          lineId: proposal.lineId,
          kind: proposal.kind,
          value: proposal.value === null ? null : toMoney(proposal.value),
        })),
        assessment: input.assessment,
      }),
    );
    return this.get(caller, id);
  }
}
