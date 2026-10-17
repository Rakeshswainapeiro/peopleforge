import {
  CycleSchema,
  DashboardSummarySchema,
  EmployeeOptionSchema,
  EvidenceFileSchema,
  IncrementRequestPageSchema,
  IncrementRequestSchema,
  RemoveLineResultSchema,
  RequestLinePageSchema,
  ReviewQueuePageSchema,
  type CreateIncrementRequest,
  type DecideLine,
  type ReviewQueuePage,
  type ReviewQueueQuery,
  type Cycle,
  type DashboardFilter,
  type DashboardSummary,
  type EmployeeOption,
  type EvidenceFile,
  type IncrementRequest,
  type IncrementRequestPage,
  type RemoveLineResult,
  type RequestLinePage,
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

/** Dashboard filters and paging as API query parameters (R1-10); IDs validated first. */
export interface DashboardQuery extends DashboardFilter {
  page?: number;
  pageSize?: number;
  requestId?: string | undefined;
  /** By request only: newest first (default) or oldest first. */
  order?: 'newest' | 'oldest';
}

function dashboardParams(options: DashboardQuery, paged: boolean): string {
  const query = new URLSearchParams();
  if (options.cycleId !== undefined) query.set('cycleId', Id.parse(options.cycleId));
  if (options.entityId !== undefined) query.set('entityId', Id.parse(options.entityId));
  if (options.status !== undefined) query.set('status', options.status);
  if (options.search !== undefined) query.set('search', options.search);
  if (options.requestId !== undefined) query.set('requestId', Id.parse(options.requestId));
  if (options.order !== undefined) query.set('order', options.order);
  if (paged) {
    query.set('page', String(options.page ?? 1));
    query.set('pageSize', String(options.pageSize ?? 10));
  }
  return query.toString();
}

/** "My increment requests", By request. */
export function listRequests(
  options: DashboardQuery = {},
): Promise<ApiResult<IncrementRequestPage>> {
  return callApi(`${BASE}?${dashboardParams(options, true)}`, IncrementRequestPageSchema);
}

/** The KPI cards and tab counts. */
export function dashboardSummary(
  filter: DashboardFilter = {},
): Promise<ApiResult<DashboardSummary>> {
  const query = dashboardParams(filter, false);
  return callApi(`${BASE}/summary${query === '' ? '' : `?${query}`}`, DashboardSummarySchema);
}

/** "My increment requests", By employee: no salaries, the proposed percentage only. */
export function listRequestLines(
  options: DashboardQuery = {},
): Promise<ApiResult<RequestLinePage>> {
  return callApi(
    `/api/v1/increment-request-lines?${dashboardParams(options, true)}`,
    RequestLinePageSchema,
  );
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

/** "Mark verified" (or undo) for one criterion of one employee (R1-07, R1-10). */
export function verifyCriterion(
  id: string,
  lineId: string,
  criterionId: string,
  verified: boolean,
): Promise<ApiResult<IncrementRequest>> {
  return callApi(
    requestPath(id, `/lines/${Id.parse(lineId)}/verifications/${Id.parse(criterionId)}`),
    IncrementRequestSchema,
    { method: verified ? 'PUT' : 'DELETE' },
  );
}

/** Approves, rejects or returns one employee (R1-08, R1-09); a repeated key is a replay. */
export function decideEmployee(
  id: string,
  lineId: string,
  body: DecideLine,
  idempotencyKey: string,
): Promise<ApiResult<IncrementRequest>> {
  return callApi(requestPath(id, `/lines/${Id.parse(lineId)}/decision`), IncrementRequestSchema, {
    method: 'POST',
    body,
    idempotencyKey,
  });
}

/** Sends the returned employees back to Sirius HR (R1-08). */
export function resubmitRequest(
  id: string,
  version: number,
  note: string,
  idempotencyKey: string,
): Promise<ApiResult<IncrementRequest>> {
  return callApi(requestPath(id, '/resubmit'), IncrementRequestSchema, {
    method: 'POST',
    body: { version, note },
    idempotencyKey,
  });
}

/** Sirius HR's Review queue (R1-07). */
export function reviewQueue(
  options: Partial<ReviewQueueQuery> = {},
): Promise<ApiResult<ReviewQueuePage>> {
  const query = new URLSearchParams();
  if (options.cycleId !== undefined) query.set('cycleId', Id.parse(options.cycleId));
  if (options.entityId !== undefined) query.set('entityId', Id.parse(options.entityId));
  if (options.search !== undefined) query.set('search', options.search);
  query.set('filter', options.filter ?? 'pending');
  query.set('page', String(options.page ?? 1));
  query.set('pageSize', String(options.pageSize ?? 10));
  return callApi(`/api/v1/review-queue?${query.toString()}`, ReviewQueuePageSchema);
}
