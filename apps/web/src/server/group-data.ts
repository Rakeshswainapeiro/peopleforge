import {
  CompensationSchema,
  ExecutiveViewSchema,
  GroupOverviewSchema,
  type Compensation,
  type ExecutiveView,
  type GroupOverview,
  AnomalyRuleSchema,
  EmployeeHistorySchema,
  EmployeePageSchema,
  FieldTemplateSchema,
  FlagDetailSchema,
  FlagPageSchema,
  FlagSchema,
  UploadDetailSchema,
  UploadPageSchema,
  type AnomalyRule,
  type EmployeeHistory,
  type EmployeePage,
  type ExtractFormat,
  type FieldTemplate,
  type Flag,
  type FlagDetail,
  type FlagPage,
  type FlagStatus,
  type PublishTemplate,
  type UpdateFlag,
  type UpdateRule,
  type UploadDetail,
  type UploadPage,
} from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import type { ApiResult, DownloadResult } from './api-client';
import { REPORT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from './increment-requests';
import { callApi, downloadFromApi } from './session';

/**
 * Typed calls to the group data API (R2-01 … R2-14). IDs are validated before they reach a
 * path; query values go through URLSearchParams.
 */

const Id = z.uuid();
const RuleCode = z.string().regex(/^ANM-\d{2}$/u);
const GROUP = '/api/v1/group';

/** Only the values that are set, as a query string (every caller sets at least one). */
function query(values: Readonly<Record<string, string | number | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return `?${params.toString()}`;
}

export function getTemplate(): Promise<ApiResult<FieldTemplate>> {
  return callApi(`${GROUP}/template`, FieldTemplateSchema);
}

export function downloadTemplate(locale: Locale): Promise<DownloadResult> {
  return downloadFromApi(`${GROUP}/template/file${query({ locale })}`);
}

/** A subsidiary's file for a month (multipart); scanned and checked before the answer. */
export function uploadGroupData(form: FormData): Promise<ApiResult<UploadDetail>> {
  return callApi(`${GROUP}/uploads`, UploadDetailSchema, {
    method: 'POST',
    form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

export function listUploads(filter: {
  entityId?: string | undefined;
  period?: string | undefined;
  page: number;
  pageSize?: number;
}): Promise<ApiResult<UploadPage>> {
  return callApi(
    `${GROUP}/uploads${query({
      entityId: filter.entityId === undefined ? undefined : Id.parse(filter.entityId),
      period: filter.period,
      page: filter.page,
      pageSize: filter.pageSize,
    })}`,
    UploadPageSchema,
  );
}

export function getUpload(id: string): Promise<ApiResult<UploadDetail>> {
  return callApi(`${GROUP}/uploads/${Id.parse(id)}`, UploadDetailSchema);
}

export function downloadUploadIssues(id: string, locale: Locale): Promise<DownloadResult> {
  return downloadFromApi(`${GROUP}/uploads/${Id.parse(id)}/issues${query({ locale })}`);
}

export function downloadUploadFile(id: string): Promise<DownloadResult> {
  return downloadFromApi(`${GROUP}/uploads/${Id.parse(id)}/file`);
}

export function listEmployees(filter: {
  period: string;
  entityId?: string | undefined;
  department?: string | undefined;
  search?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<ApiResult<EmployeePage>> {
  return callApi(
    `${GROUP}/employees${query({
      period: filter.period,
      entityId: filter.entityId === undefined ? undefined : Id.parse(filter.entityId),
      department: filter.department,
      search: filter.search,
      page: filter.page,
      pageSize: filter.pageSize,
    })}`,
    EmployeePageSchema,
  );
}

export function getEmployeeHistory(id: string): Promise<ApiResult<EmployeeHistory>> {
  return callApi(`${GROUP}/employees/${Id.parse(id)}/history`, EmployeeHistorySchema);
}

/** RP-08 raw extract; large exports may take up to 60 s (NFR-PERF-01). */
export function downloadExtract(filter: {
  format: ExtractFormat;
  period: string;
  entityId?: string | undefined;
  allVersions: boolean;
  locale: Locale;
}): Promise<DownloadResult> {
  return downloadFromApi(
    `${GROUP}/extract${query({
      format: filter.format,
      period: filter.period,
      entityId: filter.entityId === undefined ? undefined : Id.parse(filter.entityId),
      allVersions: String(filter.allVersions),
      locale: filter.locale,
    })}`,
    REPORT_TIMEOUT_MS,
  );
}

export function listFlags(filter: {
  period?: string | undefined;
  entityId?: string | undefined;
  status?: FlagStatus | undefined;
  rule?: string | undefined;
  page: number;
}): Promise<ApiResult<FlagPage>> {
  return callApi(
    `${GROUP}/flags${query({
      period: filter.period,
      entityId: filter.entityId === undefined ? undefined : Id.parse(filter.entityId),
      status: filter.status,
      rule: filter.rule === undefined ? undefined : RuleCode.parse(filter.rule),
      page: filter.page,
    })}`,
    FlagPageSchema,
  );
}

export function getFlag(id: string): Promise<ApiResult<FlagDetail>> {
  return callApi(`${GROUP}/flags/${Id.parse(id)}`, FlagDetailSchema);
}

export function updateFlag(id: string, body: UpdateFlag): Promise<ApiResult<Flag>> {
  return callApi(`${GROUP}/flags/${Id.parse(id)}`, FlagSchema, { method: 'PATCH', body });
}

export function remindFlagOwner(id: string): Promise<ApiResult<null>> {
  return callApi(`${GROUP}/flags/${Id.parse(id)}/remind`, z.null(), { method: 'POST' });
}

export function getTemplateSettings(): Promise<ApiResult<FieldTemplate>> {
  return callApi('/api/v1/settings/template', FieldTemplateSchema);
}

export function publishTemplate(body: PublishTemplate): Promise<ApiResult<FieldTemplate>> {
  return callApi('/api/v1/settings/template', FieldTemplateSchema, { method: 'PUT', body });
}

export function getAnomalyRules(): Promise<ApiResult<AnomalyRule[]>> {
  return callApi('/api/v1/settings/anomaly-rules', z.array(AnomalyRuleSchema));
}

export function updateAnomalyRule(code: string, body: UpdateRule): Promise<ApiResult<AnomalyRule>> {
  return callApi(`/api/v1/settings/anomaly-rules/${RuleCode.parse(code)}`, AnomalyRuleSchema, {
    method: 'PUT',
    body,
  });
}

/** A page's data, or the right way out: "Session ended", or the error page (API down). */
export function required<T>(result: ApiResult<T>): T {
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind === 'error' && result.status === 404) notFound();
  if (result.kind !== 'ok') throw new Error('Group data API unavailable');
  return result.data;
}

/** DASH-D5 Group overview (R2-05). */
export function getGroupOverview(filter: {
  period: string;
  entityId?: string | undefined;
  department?: string | undefined;
}): Promise<ApiResult<GroupOverview>> {
  return callApi(
    `${GROUP}/overview${query({
      period: filter.period,
      entityId: filter.entityId === undefined ? undefined : Id.parse(filter.entityId),
      department: filter.department,
    })}`,
    GroupOverviewSchema,
  );
}

/** DASH-D6 Compensation trends (R2-05). */
export function getCompensation(filter: {
  period: string;
  entityId?: string | undefined;
  department?: string | undefined;
}): Promise<ApiResult<Compensation>> {
  return callApi(
    `${GROUP}/compensation${query({
      period: filter.period,
      entityId: filter.entityId === undefined ? undefined : Id.parse(filter.entityId),
      department: filter.department,
    })}`,
    CompensationSchema,
  );
}

/** DASH-D8 Executive / IHC view (R2-07). */
export function getExecutiveView(period: string): Promise<ApiResult<ExecutiveView>> {
  return callApi(`${GROUP}/executive${query({ period })}`, ExecutiveViewSchema);
}
