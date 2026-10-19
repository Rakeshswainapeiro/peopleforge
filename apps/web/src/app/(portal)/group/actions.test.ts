import { revalidatePath } from 'next/cache';
import { must } from '@/test-support/requests';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  publishTemplate,
  remindFlagOwner,
  updateAnomalyRule,
  updateFlag,
  uploadGroupData,
} from '@/server/group-data';
import {
  anomalyRules,
  FLAG_ID,
  fieldTemplate,
  flag,
  SUB_A,
  UPLOAD_ID,
  uploadDetail,
} from '@/test-support/group';
import {
  publishTemplateAction,
  remindFlagAction,
  updateFlagAction,
  updateRuleAction,
  uploadGroupDataAction,
} from './actions';

vi.mock('@/server/group-data', () => ({
  publishTemplate: vi.fn(),
  remindFlagOwner: vi.fn(),
  updateAnomalyRule: vi.fn(),
  updateFlag: vi.fn(),
  uploadGroupData: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const refused = (status: number, code: string, path = 'file') => ({
  kind: 'error' as const,
  status,
  code: 'VALIDATION_FAILED' as const,
  details: [{ path, code }],
});

function uploadForm(file: File | null = new File(['a,b'], 'data.csv', { type: 'text/csv' })) {
  const data = new FormData();
  data.set('entityId', SUB_A);
  data.set('period', '2026-09');
  if (file !== null) data.set('file', file);
  return data;
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.mocked(uploadGroupData).mockResolvedValue({ kind: 'ok', data: uploadDetail() });
  vi.mocked(updateFlag).mockResolvedValue({ kind: 'ok', data: flag() });
  vi.mocked(remindFlagOwner).mockResolvedValue({ kind: 'ok', data: null });
  vi.mocked(publishTemplate).mockResolvedValue({ kind: 'ok', data: fieldTemplate({ version: 2 }) });
  vi.mocked(updateAnomalyRule).mockResolvedValue({ kind: 'ok', data: must(anomalyRules().at(1)) });
});

describe('uploadGroupDataAction [R2-01]', () => {
  it('sends the subsidiary, month and file, then opens the result', async () => {
    await expect(uploadGroupDataAction({}, uploadForm())).rejects.toThrow(
      `NEXT_REDIRECT /group/uploads/${UPLOAD_ID}`,
    );
    const sent = vi.mocked(uploadGroupData).mock.calls[0]?.[0];
    expect(sent?.get('entityId')).toBe(SUB_A);
    expect(sent?.get('period')).toBe('2026-09');
    expect((sent?.get('file') as File).name).toBe('data.csv');
    expect(revalidatePath).toHaveBeenCalledWith('/group', 'layout');
  });

  it('refuses a missing field or file, an empty or oversized file, before calling', async () => {
    expect(await uploadGroupDataAction({ attempt: 1 }, uploadForm(null))).toEqual({
      attempt: 2,
      error: 'group.errors.invalid',
    });
    expect(await uploadGroupDataAction({}, uploadForm(new File([], 'e.csv')))).toMatchObject({
      error: 'group.errors.invalid',
    });
    const data = uploadForm();
    data.set('period', 'september');
    expect(await uploadGroupDataAction({}, data)).toMatchObject({ error: 'group.errors.invalid' });
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.csv');
    expect(await uploadGroupDataAction({}, uploadForm(big))).toMatchObject({
      error: 'group.errors.tooLarge',
    });
    expect(uploadGroupData).not.toHaveBeenCalled();
  });

  it('shows the API refusal in words, and goes to "Session ended" for a dead session', async () => {
    vi.mocked(uploadGroupData).mockResolvedValueOnce(refused(409, 'duplicate_file'));
    expect(await uploadGroupDataAction({}, uploadForm())).toMatchObject({
      error: 'group.errors.duplicateFile',
    });
    vi.mocked(uploadGroupData).mockResolvedValueOnce({ kind: 'unavailable' });
    expect(await uploadGroupDataAction({}, uploadForm())).toMatchObject({
      error: 'group.errors.unavailable',
    });
    vi.mocked(uploadGroupData).mockResolvedValueOnce({ kind: 'unauthenticated' });
    await expect(uploadGroupDataAction({}, uploadForm())).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
  });
});

describe('updateFlagAction [R2-11]', () => {
  it('saves owner, status and note', async () => {
    const result = await updateFlagAction(
      {},
      form({ flagId: FLAG_ID, ownerId: 'oid-alpha', status: 'resolved', note: ' Checked. ' }),
    );
    expect(result).toEqual({ attempt: 1, done: true });
    expect(updateFlag).toHaveBeenCalledWith(FLAG_ID, {
      ownerId: 'oid-alpha',
      status: 'resolved',
      note: 'Checked.',
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/group/quality/flags/${FLAG_ID}`);
    await updateFlagAction({}, form({ flagId: FLAG_ID, ownerId: '', status: 'open' }));
    expect(updateFlag).toHaveBeenLastCalledWith(FLAG_ID, {
      ownerId: null,
      status: 'open',
      note: null,
    });
  });

  it('needs a note to resolve, a valid flag and status', async () => {
    expect(
      await updateFlagAction({}, form({ flagId: FLAG_ID, status: 'resolved', note: '' })),
    ).toMatchObject({ error: 'group.errors.noteRequired' });
    expect(await updateFlagAction({}, form({ flagId: FLAG_ID, status: 'gone' }))).toMatchObject({
      error: 'group.errors.invalid',
    });
    expect(await updateFlagAction({}, form({ flagId: 'x', status: 'open' }))).toMatchObject({
      error: 'group.errors.invalid',
    });
    vi.mocked(updateFlag).mockResolvedValueOnce(refused(409, 'superseded', 'status'));
    expect(await updateFlagAction({}, form({ flagId: FLAG_ID, status: 'open' }))).toMatchObject({
      error: 'group.errors.superseded',
    });
  });
});

describe('remindFlagAction [R2-11]', () => {
  it('sends a reminder, refusing a bad flag and showing a refusal', async () => {
    expect(await remindFlagAction({}, form({ flagId: FLAG_ID }))).toEqual({
      attempt: 1,
      done: true,
    });
    expect(remindFlagOwner).toHaveBeenCalledWith(FLAG_ID);
    expect(await remindFlagAction({}, form({}))).toMatchObject({ error: 'group.errors.invalid' });
    vi.mocked(remindFlagOwner).mockResolvedValueOnce(refused(403, 'forbidden'));
    expect(await remindFlagAction({}, form({ flagId: FLAG_ID }))).toMatchObject({
      error: 'group.errors.forbidden',
    });
  });
});

describe('publishTemplateAction [R2-02]', () => {
  const body = {
    version: 1,
    fields: [
      {
        key: 'employee_number',
        label: { en: 'Employee ID', ar: '' },
        type: 'text',
        required: true,
        allowedValues: [],
        palmHrField: null,
      },
    ],
  };

  it('publishes the editor JSON', async () => {
    expect(await publishTemplateAction({}, form({ template: JSON.stringify(body) }))).toEqual({
      attempt: 1,
      done: true,
    });
    expect(publishTemplate).toHaveBeenCalledWith({
      ...body,
      fields: [{ ...body.fields[0], label: { en: 'Employee ID', ar: undefined } }],
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('refuses broken JSON, invalid templates and shows refusals', async () => {
    expect(await publishTemplateAction({}, form({ template: '{' }))).toMatchObject({
      error: 'group.errors.invalid',
    });
    expect(await publishTemplateAction({}, form({}))).toMatchObject({
      error: 'group.errors.invalid',
    });
    expect(
      await publishTemplateAction(
        {},
        form({ template: JSON.stringify({ version: 1, fields: [] }) }),
      ),
    ).toMatchObject({ error: 'group.errors.invalid' });
    vi.mocked(publishTemplate).mockResolvedValueOnce(refused(409, 'stale', 'version'));
    expect(await publishTemplateAction({}, form({ template: JSON.stringify(body) }))).toMatchObject(
      {
        error: 'group.errors.stale',
      },
    );
  });
});

describe('updateRuleAction [R2-10]', () => {
  it('saves a threshold, or none', async () => {
    expect(
      await updateRuleAction({}, form({ code: 'ANM-03', threshold: '25', enabled: 'on' })),
    ).toEqual({ attempt: 1, done: true });
    expect(updateAnomalyRule).toHaveBeenCalledWith('ANM-03', { threshold: '25', enabled: true });
    await updateRuleAction({}, form({ code: 'ANM-01', threshold: ' ' }));
    expect(updateAnomalyRule).toHaveBeenLastCalledWith('ANM-01', {
      threshold: null,
      enabled: false,
    });
    await updateRuleAction({}, form({ code: 'ANM-02' }));
    expect(updateAnomalyRule).toHaveBeenLastCalledWith('ANM-02', {
      threshold: null,
      enabled: false,
    });
  });

  it('refuses bad codes and thresholds and shows refusals', async () => {
    expect(await updateRuleAction({}, form({ code: 'X', threshold: '1' }))).toMatchObject({
      error: 'group.errors.invalid',
    });
    expect(await updateRuleAction({}, form({ code: 'ANM-03', threshold: 'ten' }))).toMatchObject({
      error: 'group.errors.invalid',
    });
    vi.mocked(updateAnomalyRule).mockResolvedValueOnce({ kind: 'unavailable' });
    expect(await updateRuleAction({}, form({ code: 'ANM-03', threshold: '1' }))).toMatchObject({
      error: 'group.errors.unavailable',
    });
  });
});
