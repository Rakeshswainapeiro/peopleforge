import { RequestDataError, type RequestDataErrorReason } from '@peopleforge/db';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../errors/domain-errors.js';
import { SUB_A, SUB_B } from '../../test-support/factory.js';
import {
  alphaHr,
  CYCLE_ID,
  EMPLOYEE_1,
  LINE_1,
  LINE_2,
  REQUEST_ID,
  reviewer,
  twoEntityHr,
  workingRepository,
} from '../../test-support/increment-requests.js';
import { IncrementRequestService, toDomainError } from './increment-request.service.js';

const scopeA = { userId: 'alpha', kind: 'entity', entityIds: [SUB_A] };

describe('IncrementRequestService', () => {
  it('returns a request with derived figures and totals [R1-02]', async () => {
    const service = new IncrementRequestService(workingRepository());
    const dto = await service.get(alphaHr, REQUEST_ID);
    expect(dto.lines[0]).toMatchObject({
      increase: '1720.00',
      newSalary: '23220.00',
      percent: '8.00',
    });
    expect(dto.lines[1]).toMatchObject({ increase: null, newSalary: null, percent: null });
    expect(dto.totals).toEqual({
      employees: 2,
      proposed: 1,
      increaseByCurrency: [{ currency: 'AED', amount: '1720.00' }],
      averagePercent: '8.0',
    });
    expect(dto.createdAt).toBe('2026-10-14T07:00:00.000Z');
  });

  it('keeps drafts from Sirius reviewers until submitted', async () => {
    const repository = workingRepository();
    const service = new IncrementRequestService(repository);
    await expect(service.get(reviewer, REQUEST_ID)).rejects.toThrow(NotFoundError);
    await service.list(reviewer, { page: 1, pageSize: 10 });
    expect(repository.list).toHaveBeenCalledWith(
      { userId: 'reviewer', kind: 'group' },
      { includeDrafts: false, limit: 10, offset: 0 },
    );
  });

  it('answers not found for a request outside the caller’s scope', async () => {
    const repository = workingRepository();
    repository.get.mockResolvedValue(null);
    await expect(new IncrementRequestService(repository).get(alphaHr, REQUEST_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('creates in the caller’s only subsidiary, without duplicate employees', async () => {
    const repository = workingRepository();
    const service = new IncrementRequestService(repository);
    await service.create(
      alphaHr,
      { cycleId: CYCLE_ID, employeeIds: [EMPLOYEE_1, EMPLOYEE_1] },
      'key-12345',
    );
    expect(repository.create).toHaveBeenCalledWith(scopeA, {
      entityId: SUB_A,
      cycleId: CYCLE_ID,
      employeeIds: [EMPLOYEE_1],
      idempotencyKey: 'key-12345',
    });
  });

  it('asks a user with several subsidiaries (or Sirius) which one', async () => {
    const service = new IncrementRequestService(workingRepository());
    for (const caller of [twoEntityHr, reviewer]) {
      const attempt = service.create(caller, { cycleId: CYCLE_ID, employeeIds: [] }, 'key-12345');
      await expect(attempt).rejects.toMatchObject({
        constructor: ValidationError,
        details: [{ path: 'entityId', code: 'required' }],
      });
    }
    await expect(
      service.create(
        twoEntityHr,
        { cycleId: CYCLE_ID, entityId: SUB_B, employeeIds: [] },
        'key-12345',
      ),
    ).resolves.toMatchObject({ id: REQUEST_ID });
  });

  it('refuses to create for, or search, another subsidiary [R1-01]', async () => {
    const service = new IncrementRequestService(workingRepository());
    await expect(
      service.create(alphaHr, { cycleId: CYCLE_ID, entityId: SUB_B, employeeIds: [] }, 'key-12345'),
    ).rejects.toThrow(ForbiddenError);
    expect(() => service.searchEmployees(alphaHr, { entityId: SUB_B })).toThrow(ForbiddenError);
  });

  it('searches employees with optional filters and a fixed limit', async () => {
    const repository = workingRepository();
    const service = new IncrementRequestService(repository);
    await service.searchEmployees(alphaHr, { entityId: SUB_A });
    await service.searchEmployees(reviewer, {
      entityId: SUB_B,
      search: 'omar',
      excludeRequestId: REQUEST_ID,
    });
    expect(repository.searchEmployees.mock.calls).toEqual([
      [scopeA, { entityId: SUB_A, limit: 50 }],
      [
        { userId: 'reviewer', kind: 'group' },
        { entityId: SUB_B, limit: 50, search: 'omar', excludeRequestId: REQUEST_ID },
      ],
    ]);
  });

  it('pages the list', async () => {
    const repository = workingRepository();
    const service = new IncrementRequestService(repository);
    const page = await service.list(alphaHr, { status: 'draft', page: 3, pageSize: 10 });
    await service.list(alphaHr, { page: 1, pageSize: 25 });
    expect(repository.list.mock.calls).toEqual([
      [scopeA, { includeDrafts: true, limit: 10, offset: 20, status: 'draft' }],
      [scopeA, { includeDrafts: true, limit: 25, offset: 0 }],
    ]);
    expect(page).toMatchObject({ page: 3, pageSize: 10, total: 1 });
    expect(page.items[0]?.updatedAt).toBe('2026-10-14T07:05:00.000Z');
  });

  it('adds and removes employees, returning the updated request', async () => {
    const repository = workingRepository();
    const service = new IncrementRequestService(repository);
    await expect(service.addLine(alphaHr, REQUEST_ID, EMPLOYEE_1)).resolves.toMatchObject({
      id: REQUEST_ID,
    });
    await expect(service.removeLine(alphaHr, REQUEST_ID, LINE_1)).resolves.toMatchObject({
      id: REQUEST_ID,
    });
    expect(repository.addLine).toHaveBeenCalledWith(scopeA, REQUEST_ID, EMPLOYEE_1);
    expect(repository.removeLine).toHaveBeenCalledWith(scopeA, REQUEST_ID, LINE_1);
  });

  it('saves proposals normalised to 2 decimals', async () => {
    const repository = workingRepository();
    await new IncrementRequestService(repository).setProposals(alphaHr, REQUEST_ID, {
      version: 3,
      proposals: [
        { lineId: LINE_1, kind: 'amount', value: '1720' },
        { lineId: LINE_2, kind: null, value: null },
      ],
    });
    expect(repository.setProposals).toHaveBeenCalledWith(scopeA, REQUEST_ID, {
      version: 3,
      proposals: [
        { lineId: LINE_1, kind: 'amount', value: '1720.00' },
        { lineId: LINE_2, kind: null, value: null },
      ],
    });
  });

  it('reports every invalid proposal with its position, saving none', async () => {
    const repository = workingRepository();
    const attempt = new IncrementRequestService(repository).setProposals(alphaHr, REQUEST_ID, {
      version: 3,
      proposals: [
        { lineId: LINE_1, kind: 'percent', value: '0' },
        { lineId: LINE_2, kind: 'amount', value: '16800.01' },
        { lineId: EMPLOYEE_1, kind: 'percent', value: '5' },
      ],
    });
    await expect(attempt).rejects.toMatchObject({
      details: [
        { path: 'proposals.0.value', code: 'not_positive' },
        { path: 'proposals.1.value', code: 'over_limit' },
        { path: 'proposals.2.lineId', code: 'not_found' },
      ],
    });
    expect(repository.setProposals).not.toHaveBeenCalled();
  });

  it('turns data-layer refusals into API errors and passes other errors through', async () => {
    const repository = workingRepository();
    repository.addLine.mockRejectedValueOnce(
      new RequestDataError('duplicate_employee', EMPLOYEE_1),
    );
    repository.removeLine.mockRejectedValueOnce(new Error('connection lost'));
    const service = new IncrementRequestService(repository);
    await expect(service.addLine(alphaHr, REQUEST_ID, EMPLOYEE_1)).rejects.toThrow(ConflictError);
    await expect(service.removeLine(alphaHr, REQUEST_ID, LINE_1)).rejects.toThrow(
      'connection lost',
    );
  });

  it('lists open cycles', async () => {
    await expect(
      new IncrementRequestService(workingRepository()).openCycles(alphaHr),
    ).resolves.toHaveLength(1);
  });
});

describe('toDomainError', () => {
  it.each([
    ['not_found', NotFoundError, undefined],
    ['line_not_found', NotFoundError, { path: 'lineId', code: 'not_found' }],
    ['version_conflict', ConflictError, { path: 'version', code: 'stale' }],
    ['duplicate_employee', ConflictError, { path: 'employeeId', code: 'duplicate' }],
    ['employee_not_found', ValidationError, { path: 'employeeId', code: 'not_found' }],
    ['cycle_not_open', ValidationError, { path: 'cycleId', code: 'not_open' }],
    ['entity_not_found', ValidationError, { path: 'entityId', code: 'not_found' }],
    ['no_active_criteria', ConflictError, { path: 'criteria', code: 'none_active' }],
  ] as const)('maps %s', (reason: RequestDataErrorReason, type, detail) => {
    const error = toDomainError(new RequestDataError(reason));
    expect(error).toBeInstanceOf(type);
    expect(error.details?.[0]).toEqual(detail);
  });
});
