'use server';

import {
  MAX_UPLOAD_MB,
  PublishTemplateSchema,
  RuleCodeSchema,
  UpdateFlagSchema,
  UpdateRuleSchema,
  UploadFieldsSchema,
} from '@peopleforge/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { flagHref, groupErrorFor, uploadHref, type GroupErrorKey } from '@/lib/group-view';
import type { ApiResult } from '@/server/api-client';
import {
  publishTemplate,
  remindFlagOwner,
  updateAnomalyRule,
  updateFlag,
  uploadGroupData,
} from '@/server/group-data';

/**
 * Server Actions for group employee data (R2-01, R2-02, R2-10, R2-11). POST-only with an Origin
 * check (CSRF); the API checks permissions and scope again on every call.
 */

const Id = z.uuid();
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export interface GroupFormState {
  /** Counts submissions, so a form starts afresh after each. */
  attempt?: number;
  error?: GroupErrorKey;
  done?: boolean;
}

/** The error to show for a failed call; a dead session goes to "Session ended". */
function refusal(result: Exclude<ApiResult<unknown>, { kind: 'ok' }>): GroupErrorKey {
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  return result.kind === 'error'
    ? groupErrorFor(result.status, result.details)
    : 'group.errors.unavailable';
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
};

/** "Upload": the file goes to the API, which checks, scans and records it (R2-01). */
export async function uploadGroupDataAction(
  previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const attempt = (previous.attempt ?? 0) + 1;
  const fields = UploadFieldsSchema.safeParse({
    entityId: text(formData, 'entityId'),
    period: text(formData, 'period'),
  });
  const file = formData.get('file');
  if (!fields.success || !(file instanceof File) || file.size === 0) {
    return { attempt, error: 'group.errors.invalid' };
  }
  if (file.size > MAX_BYTES) return { attempt, error: 'group.errors.tooLarge' };
  const upload = new FormData();
  upload.set('entityId', fields.data.entityId);
  upload.set('period', fields.data.period);
  upload.set('file', file, file.name);
  const result = await uploadGroupData(upload);
  if (result.kind !== 'ok') return { attempt, error: refusal(result) };
  revalidatePath('/group', 'layout');
  redirect(uploadHref(result.data.id));
}

/** Owner, status and note of a flag (R2-11); resolving needs a note. */
export async function updateFlagAction(
  previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const attempt = (previous.attempt ?? 0) + 1;
  const id = Id.safeParse(text(formData, 'flagId'));
  const owner = text(formData, 'ownerId');
  const parsed = UpdateFlagSchema.safeParse({
    ownerId: owner === undefined || owner === '' ? null : owner,
    status: text(formData, 'status'),
    note: text(formData, 'note') ?? null,
  });
  if (!id.success) return { attempt, error: 'group.errors.invalid' };
  if (!parsed.success) {
    const noNote = parsed.error.issues.some((issue) => issue.message === 'note_required');
    return { attempt, error: noNote ? 'group.errors.noteRequired' : 'group.errors.invalid' };
  }
  const result = await updateFlag(id.data, parsed.data);
  if (result.kind !== 'ok') return { attempt, error: refusal(result) };
  revalidatePath(flagHref(id.data));
  return { attempt, done: true };
}

/** "Send reminder" (Sirius HR): the owner gets an in-app and email reminder. */
export async function remindFlagAction(
  previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const attempt = (previous.attempt ?? 0) + 1;
  const id = Id.safeParse(text(formData, 'flagId'));
  if (!id.success) return { attempt, error: 'group.errors.invalid' };
  const result = await remindFlagOwner(id.data);
  if (result.kind !== 'ok') return { attempt, error: refusal(result) };
  revalidatePath(flagHref(id.data));
  return { attempt, done: true };
}

/** "Publish version N" of the field template (R2-02); the body is the editor's JSON. */
export async function publishTemplateAction(
  previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const attempt = (previous.attempt ?? 0) + 1;
  let body: unknown;
  try {
    body = JSON.parse(text(formData, 'template') ?? '');
  } catch {
    return { attempt, error: 'group.errors.invalid' };
  }
  const parsed = PublishTemplateSchema.safeParse(body);
  if (!parsed.success) return { attempt, error: 'group.errors.invalid' };
  const result = await publishTemplate(parsed.data);
  if (result.kind !== 'ok') return { attempt, error: refusal(result) };
  revalidatePath('/settings');
  return { attempt, done: true };
}

/** "Save" on one anomaly rule (R2-10): on or off, and its threshold. */
export async function updateRuleAction(
  previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const attempt = (previous.attempt ?? 0) + 1;
  const code = RuleCodeSchema.safeParse(text(formData, 'code'));
  const threshold = text(formData, 'threshold');
  const parsed = UpdateRuleSchema.safeParse({
    threshold: threshold === undefined || threshold.trim() === '' ? null : threshold,
    enabled: formData.get('enabled') === 'on',
  });
  if (!code.success || !parsed.success) return { attempt, error: 'group.errors.invalid' };
  const result = await updateAnomalyRule(code.data, parsed.data);
  if (result.kind !== 'ok') return { attempt, error: refusal(result) };
  revalidatePath('/settings');
  return { attempt, done: true };
}
