import {
  NotificationPageSchema,
  NotificationSummarySchema,
  type NotificationFilter,
  type NotificationPage,
  type NotificationSummary,
} from '@peopleforge/contracts';
import { z } from 'zod';
import type { ApiResult } from './api-client';
import { callApi } from './session';

/** Typed calls to the notification API (R1-07, R1-13): the signed-in user's own. */
const BASE = '/api/v1/notifications';

export const NOTIFICATION_PAGE_SIZE = 20;

export function listNotifications(
  filter: NotificationFilter,
  page: number,
): Promise<ApiResult<NotificationPage>> {
  const query = new URLSearchParams({
    filter,
    page: String(page),
    pageSize: String(NOTIFICATION_PAGE_SIZE),
  });
  return callApi(`${BASE}?${query.toString()}`, NotificationPageSchema);
}

export function notificationSummary(): Promise<ApiResult<NotificationSummary>> {
  return callApi(`${BASE}/summary`, NotificationSummarySchema);
}

/** The given notifications, or all of the user's when `ids` is undefined. */
export function markNotificationsRead(ids?: readonly string[]): Promise<ApiResult<null>> {
  return callApi(`${BASE}/read`, z.null(), {
    method: 'POST',
    body: ids === undefined ? {} : { ids: [...ids] },
  });
}
