import {
  CycleSchema,
  EmployeeOptionSchema,
  EvidenceFileSchema,
  IncrementRequestPageSchema,
  IncrementRequestSchema,
  RemoveLineResultSchema,
  type CreateIncrementRequest,
  type Cycle,
  type EmployeeOption,
  type EvidenceFile,
  type IncrementRequest,
  type IncrementRequestPage,
  type RemoveLineResult,
  type SaveDraft,
} from '@peopleforge/contracts';
import { z } from 'zod';
import type { ApiResult, DownloadResult } from './api-client';
import { callApi, downloadFromApi } from './session';

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

export function removeEmployee(id: string, lineId: string): Promise<ApiResult<RemoveLineResult>> {
  return callApi(requestPath(id, `/lines/${Id.parse(lineId)}`), RemoveLineResultSchema, {
    method: 'DELETE',
  });
}

/** Proposals and, optionally, one employee's criteria (R1-02, R1-03). */
export function saveDraftChanges(
  id: string,
  body: SaveDraft,
): Promise<ApiResult<IncrementRequest>> {
  return callApi(requestPath(id, '/draft'), IncrementRequestSchema, { method: 'PUT', body });
}

/**
 * Up to 10 MB sent, then content-checked and malware-scanned before the API answers (clamd's
 * own timeout is 15 s): far longer than an ordinary call.
 */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** One evidence file for one employee and criterion (R1-04): `lineId`, `criterionId`, `file`. */
export function uploadEvidence(id: string, form: FormData): Promise<ApiResult<EvidenceFile>> {
  return callApi(requestPath(id, '/evidence'), EvidenceFileSchema, {
    method: 'POST',
    form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

export function removeEvidence(id: string, evidenceId: string): Promise<ApiResult<null>> {
  return callApi(requestPath(id, `/evidence/${Id.parse(evidenceId)}`), z.null(), {
    method: 'DELETE',
  });
}

/** Sends the draft to Sirius HR (R1-07); a repeated key returns the submitted request. */
export function submitRequest(
  id: string,
  version: number,
  idempotencyKey: string,
): Promise<ApiResult<IncrementRequest>> {
  return callApi(requestPath(id, '/submit'), IncrementRequestSchema, {
    method: 'POST',
    body: { version },
    idempotencyKey,
  });
}

export function downloadEvidence(id: string, evidenceId: string): Promise<DownloadResult> {
  return downloadFromApi(requestPath(id, `/evidence/${Id.parse(evidenceId)}`));
}
