import {
  IncrementAnalyticsSchema,
  type AnalyticsQuery,
  type IncrementAnalytics,
} from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type { ApiResult, DownloadResult } from './api-client';
import { REPORT_TIMEOUT_MS } from './increment-requests';
import { callApi, downloadFromApi } from './session';

/** Typed calls to the analytics API (R1-11, R1-12) and RP-02. IDs validated before use. */
const Id = z.uuid();

function filterParams(query: AnalyticsQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.cycleId !== undefined) params.set('cycleId', Id.parse(query.cycleId));
  if (query.entityId !== undefined) params.set('entityId', Id.parse(query.entityId));
  return params;
}

export function getIncrementAnalytics(
  query: AnalyticsQuery = {},
): Promise<ApiResult<IncrementAnalytics>> {
  const params = filterParams(query).toString();
  return callApi(
    `/api/v1/analytics/increments${params === '' ? '' : `?${params}`}`,
    IncrementAnalyticsSchema,
  );
}

/** RP-02 as Excel, streamed; the API records the download. */
export function downloadTatReport(query: AnalyticsQuery, locale: Locale): Promise<DownloadResult> {
  const params = filterParams(query);
  params.set('format', 'xlsx');
  params.set('locale', locale);
  return downloadFromApi(
    `/api/v1/reports/tat-back-and-forth?${params.toString()}`,
    REPORT_TIMEOUT_MS,
  );
}
