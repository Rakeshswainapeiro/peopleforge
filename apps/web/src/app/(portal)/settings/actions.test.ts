import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criteriaSettings } from '@/test-support/requests';
import { publishCriteria, updateReminderRule } from '@/server/settings';
import { publishCriteriaAction, updateReminderAction } from './actions';

vi.mock('@/server/settings', () => ({ publishCriteria: vi.fn(), updateReminderRule: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

function criteriaForm(nameEn = 'Performance rating', version = '1'): FormData {
  const data = new FormData();
  data.set('version', version);
  data.append('code', 'C1');
  data.append('nameEn', nameEn);
  data.append('nameAr', '');
  data.append('descriptionEn', 'Latest appraisal meets the minimum.');
  data.append('descriptionAr', '');
  data.append('evidencePolicy', 'required');
  data.append('maxFileMb', '5');
  data.append('justification-C1', 'on');
  return data;
}

function reminderForm(kind = 'review_overdue', days = '3', enabled = true): FormData {
  const data = new FormData();
  data.set('kind', kind);
  data.set('days', days);
  if (enabled) data.set('enabled', 'on');
  return data;
}

beforeEach(() => {
  vi.mocked(publishCriteria).mockResolvedValue({
    kind: 'ok',
    data: criteriaSettings({ version: 2 }),
  });
  vi.mocked(updateReminderRule).mockResolvedValue({
    kind: 'ok',
    data: {
      kind: 'review_overdue',
      days: 3,
      enabled: true,
      updatedAt: '2026-10-18T06:00:00.000Z',
      updatedByName: 'Admin Test',
    },
  });
});

describe('publishCriteriaAction [R1-05]', () => {
  it('publishes the edited criteria and re-renders Settings', async () => {
    await expect(publishCriteriaAction({ attempt: 1 }, criteriaForm())).resolves.toEqual({
      attempt: 2,
      published: 2,
    });
    expect(publishCriteria).toHaveBeenCalledWith({
      version: 1,
      criteria: [
        {
          code: 'C1',
          name: { en: 'Performance rating', ar: undefined },
          description: { en: 'Latest appraisal meets the minimum.', ar: undefined },
          justificationRequired: true,
          evidencePolicy: 'required',
          maxFileMb: 5,
        },
      ],
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('keeps what was typed when it is invalid, stale or fails', async () => {
    const invalid = await publishCriteriaAction({}, criteriaForm('  '));
    expect(invalid).toMatchObject({ attempt: 1, error: 'settings.errors.invalid' });
    expect(invalid.fields?.[0]?.nameEn).toBe('  ');
    await expect(publishCriteriaAction({}, criteriaForm('Rating', 'x'))).resolves.toMatchObject({
      error: 'settings.errors.invalid',
    });
    expect(publishCriteria).not.toHaveBeenCalled();
    vi.mocked(publishCriteria).mockResolvedValue({
      kind: 'error',
      status: 409,
      code: 'CONFLICT',
      details: [{ path: 'version', code: 'stale' }],
    });
    await expect(publishCriteriaAction({}, criteriaForm())).resolves.toMatchObject({
      error: 'settings.errors.stale',
      fields: [{ code: 'C1', nameEn: 'Performance rating' }],
    });
    vi.mocked(publishCriteria).mockResolvedValue({ kind: 'unavailable' });
    await expect(publishCriteriaAction({}, criteriaForm())).resolves.toMatchObject({
      error: 'settings.errors.generic',
    });
    vi.mocked(publishCriteria).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(publishCriteriaAction({}, criteriaForm())).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
  });
});

describe('updateReminderAction [R1-13]', () => {
  it('saves a trigger, unticked meaning off', async () => {
    await expect(updateReminderAction({}, reminderForm())).resolves.toEqual({
      attempt: 1,
      saved: true,
    });
    await updateReminderAction({ attempt: 1 }, reminderForm('deadline_approaching', '5', false));
    expect(vi.mocked(updateReminderRule).mock.calls).toEqual([
      ['review_overdue', { days: 3, enabled: true }],
      ['deadline_approaching', { days: 5, enabled: false }],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('refuses unknown triggers and out-of-range days without calling the API', async () => {
    await expect(updateReminderAction({}, reminderForm('everything'))).resolves.toEqual({
      attempt: 1,
      error: 'settings.errors.invalid',
    });
    await expect(updateReminderAction({}, reminderForm('review_overdue', '0'))).resolves.toEqual({
      attempt: 1,
      error: 'settings.errors.invalid',
    });
    expect(updateReminderRule).not.toHaveBeenCalled();
    vi.mocked(updateReminderRule).mockResolvedValue({
      kind: 'error',
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [],
    });
    await expect(updateReminderAction({}, reminderForm())).resolves.toEqual({
      attempt: 1,
      error: 'settings.errors.invalid',
    });
  });
});
