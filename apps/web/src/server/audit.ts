import {
  AuditTrailPageSchema,
  type AuditTrailPage,
  type AuditTrailQuery,
} from '@peopleforge/contracts';
import type { ApiResult } from './api-client';
import { callApi } from './session';

/** The whole audit trail (R1-15), for `audit:read`. */
export function listAudit(
  query: Partial<AuditTrailQuery> = {},
): Promise<ApiResult<AuditTrailPage>> {
  const params = new URLSearchParams();
  if (query.actor !== undefined) params.set('actor', query.actor);
  if (query.search !== undefined) params.set('search', query.search);
  if (query.from !== undefined) params.set('from', query.from);
  if (query.to !== undefined) params.set('to', query.to);
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 25));
  return callApi(`/api/v1/audit?${params.toString()}`, AuditTrailPageSchema);
}
