import {
  CycleSchema,
  EmployeeOptionSchema,
  IncrementRequestPageSchema,
  IncrementRequestSchema,
  type CreateIncrementRequest,
  type Cycle,
  type EmployeeOption,
  type IncrementRequest,
  type IncrementRequestPage,
  type SetProposals,
} from '@peopleforge/contracts';
import { z } from 'zod';
import type { ApiResult } from './api-client';
import { callApi } from './session';

/** Typed calls to the increment request API (R1-02). IDs are validated before use in a path. */
const BASE = '/api/v1/increment-requests';
const Id = z.uuid();

function requestPath(id: string, suffix = ''): string {
  return `${BASE}/${Id.parse(id)}${suffix}`;
}

export function openCycles(): Promise<ApiResult<Cycle[]>> {
  return callApi('/api/v1/increment-cycles/open', z.array(CycleSchema));
}

export function searchEmployees(
  entityId: string,
  excludeRequestId?: string,
): Promise<ApiResult<EmployeeOption[]>> {
  const query = new URLSearchParams({ entityId: Id.parse(entityId) });
  if (excludeRequestId !== undefined) query.set('excludeRequestId', Id.parse(excludeRequestId));
  return callApi(`/api/v1/employees?${query.toString()}`, z.array(EmployeeOptionSchema));
}

export function listRequests(
  options: { status?: 'draft'; page?: number; pageSize?: number } = {},
): Promise<ApiResult<IncrementRequestPage>> {
  const query = new URLSearchParams();
  if (options.status !== undefined) query.set('status', options.status);
  query.set('page', String(options.page ?? 1));
  query.set('pageSize', String(options.pageSize ?? 10));
  return callApi(`${BASE}?${query.toString()}`, IncrementRequestPageSchema);
}

export function getRequest(id: string): Promise<ApiResult<IncrementRequest>> {
  return callApi(requestPath(id), IncrementRequestSchema);
}

export function createRequest(
  body: CreateIncrementRequest,
  idempotencyKey: string,
): Promise<ApiResult<IncrementRequest>> {
  return callApi(BASE, IncrementRequestSchema, { method: 'POST', body, idempotencyKey });
}

export function addEmployee(id: string, employeeId: string): Promise<ApiResult<IncrementRequest>> {
  return callApi(requestPath(id, '/lines'), IncrementRequestSchema, {
    method: 'POST',
    body: { employeeId },
  });
}

export function removeEmployee(id: string, lineId: string): Promise<ApiResult<IncrementRequest>> {
  return callApi(requestPath(id, `/lines/${Id.parse(lineId)}`), IncrementRequestSchema, {
    method: 'DELETE',
  });
}

export function saveProposals(
  id: string,
  body: SetProposals,
): Promise<ApiResult<IncrementRequest>> {
  return callApi(requestPath(id, '/proposals'), IncrementRequestSchema, { method: 'PUT', body });
}
