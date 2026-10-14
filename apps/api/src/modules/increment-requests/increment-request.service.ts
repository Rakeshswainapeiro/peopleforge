import type {
  CreateIncrementRequest,
  Cycle,
  EmployeeOption,
  IncrementRequest,
  IncrementRequestPage,
  RequestStatus,
  SetProposals,
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
  }
}

async function guard<T>(work: Promise<T>): Promise<T> {
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

function toDto(record: IncrementRequestRecord): IncrementRequest {
  const lines = record.lines.map((line) => {
    const figures = lineFigures(line.currentSalary, line.proposedKind, line.proposedValue);
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
      },
      totalsInput: { currency: line.currency, figures },
    };
  });
  return {
    id: record.id,
    reference: record.reference,
    status: record.status,
    entity: record.entity,
    cycle: record.cycle,
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
    if (record === null || (isDraft(record.status) && !seesDrafts(caller))) {
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

  async removeLine(caller: Principal, id: string, lineId: string): Promise<IncrementRequest> {
    await guard(this.repository.removeLine(scopeOf(caller), id, lineId));
    return this.get(caller, id);
  }

  /** Saves the proposed increments (the "Save draft" table), all or nothing. */
  async setProposals(
    caller: Principal,
    id: string,
    input: SetProposals,
  ): Promise<IncrementRequest> {
    const current = await this.get(caller, id);
    const salaries = new Map(current.lines.map((line) => [line.id, line.currentSalary]));
    const problems = input.proposals.flatMap((proposal, index) => {
      const salary = salaries.get(proposal.lineId);
      if (salary === undefined)
        return [{ path: `proposals.${String(index)}.lineId`, code: 'not_found' }];
      if (proposal.kind === null || proposal.value === null) return [];
      const problem = proposalProblem(salary, proposal.kind, proposal.value);
      return problem === null ? [] : [{ path: `proposals.${String(index)}.value`, code: problem }];
    });
    if (problems.length > 0) throw new ValidationError('Invalid proposals', problems);
    await guard(
      this.repository.setProposals(scopeOf(caller), id, {
        version: input.version,
        proposals: input.proposals.map((proposal) => ({
          lineId: proposal.lineId,
          kind: proposal.kind,
          value: proposal.value === null ? null : toMoney(proposal.value),
        })),
      }),
    );
    return this.get(caller, id);
  }
}
