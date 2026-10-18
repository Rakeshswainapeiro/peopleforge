'use server';

import { PublishCriteriaSchema, UpdateReminderRuleSchema } from '@peopleforge/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  fieldsFromForm,
  publishBody,
  reminderKindOf,
  settingsErrorFor,
  type CriterionFields,
  type SettingsErrorKey,
} from '@/lib/settings-view';
import type { ApiResult } from '@/server/api-client';
import { publishCriteria, updateReminderRule } from '@/server/settings';

/** Server Actions for Settings (R1-05, R1-13). POST-only with an Origin check (CSRF). */

const SETTINGS_PATH = '/settings';
const Version = z.coerce.number().int().min(1);

export interface CriteriaFormState {
  /** Counts submissions, so the form starts afresh after each. */
  attempt?: number;
  error?: SettingsErrorKey;
  /** What was typed, kept when publishing is refused. */
  fields?: CriterionFields[];
  /** The version just published. */
  published?: number;
}

export interface ReminderFormState {
  attempt?: number;
  error?: SettingsErrorKey;
  saved?: boolean;
}

/** The error to show for a failed call; a dead session goes to "Session ended". */
function refusal(result: Exclude<ApiResult<unknown>, { kind: 'ok' }>): SettingsErrorKey {
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  return result.kind === 'error'
    ? settingsErrorFor(result.code, result.details)
    : 'settings.errors.generic';
}

/** "Publish version N": the edited criteria become the next version (R1-05). */
export async function publishCriteriaAction(
  previous: CriteriaFormState,
  formData: FormData,
): Promise<CriteriaFormState> {
  const attempt = (previous.attempt ?? 0) + 1;
  const fields = fieldsFromForm(formData);
  const version = Version.safeParse(formData.get('version'));
  const parsed = PublishCriteriaSchema.safeParse(publishBody(version.data ?? 0, fields));
  if (!parsed.success) return { attempt, error: 'settings.errors.invalid', fields };
  const result = await publishCriteria(parsed.data);
  if (result.kind !== 'ok') return { attempt, error: refusal(result), fields };
  revalidatePath(SETTINGS_PATH);
  return { attempt, published: result.data.version };
}

/** "Save" on one reminder trigger (R1-13). */
export async function updateReminderAction(
  previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const attempt = (previous.attempt ?? 0) + 1;
  const kind = reminderKindOf(formData.get('kind'));
  const parsed = UpdateReminderRuleSchema.safeParse({
    days: formData.get('days'),
    enabled: formData.get('enabled') === 'on',
  });
  if (kind === null || !parsed.success) return { attempt, error: 'settings.errors.invalid' };
  const result = await updateReminderRule(kind, parsed.data);
  if (result.kind !== 'ok') return { attempt, error: refusal(result) };
  revalidatePath(SETTINGS_PATH);
  return { attempt, saved: true };
}
