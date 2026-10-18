import {
  CriteriaSettingsSchema,
  ReminderRuleSchema,
  type CriteriaSettings,
  type PublishCriteria,
  type ReminderKind,
  type ReminderRule,
  type UpdateReminderRule,
} from '@peopleforge/contracts';
import { z } from 'zod';
import type { ApiResult } from './api-client';
import { callApi } from './session';

/** Typed calls to the settings API (R1-05, R1-13), for admins with `criteria:configure`. */

export function getReminderRules(): Promise<ApiResult<ReminderRule[]>> {
  return callApi('/api/v1/settings/reminders', z.array(ReminderRuleSchema));
}

export function updateReminderRule(
  kind: ReminderKind,
  body: UpdateReminderRule,
): Promise<ApiResult<ReminderRule>> {
  return callApi(`/api/v1/settings/reminders/${kind}`, ReminderRuleSchema, {
    method: 'PUT',
    body,
  });
}

export function getCriteriaSettings(): Promise<ApiResult<CriteriaSettings>> {
  return callApi('/api/v1/settings/criteria', CriteriaSettingsSchema);
}

export function publishCriteria(body: PublishCriteria): Promise<ApiResult<CriteriaSettings>> {
  return callApi('/api/v1/settings/criteria', CriteriaSettingsSchema, { method: 'PUT', body });
}
