import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callApi } from './session';
import {
  getCriteriaSettings,
  getReminderRules,
  publishCriteria,
  updateReminderRule,
} from './settings';

vi.mock('./session', () => ({ callApi: vi.fn() }));

beforeEach(() => {
  vi.mocked(callApi).mockResolvedValue({ kind: 'unavailable' });
});

describe('settings client [R1-05, R1-13]', () => {
  it('calls the documented paths', async () => {
    await getReminderRules();
    await updateReminderRule('return_overdue', { days: 3, enabled: false });
    await getCriteriaSettings();
    await publishCriteria({ version: 1, criteria: [] });
    expect(vi.mocked(callApi).mock.calls.map(([path, , init]) => [path, init])).toEqual([
      ['/api/v1/settings/reminders', undefined],
      [
        '/api/v1/settings/reminders/return_overdue',
        { method: 'PUT', body: { days: 3, enabled: false } },
      ],
      ['/api/v1/settings/criteria', undefined],
      ['/api/v1/settings/criteria', { method: 'PUT', body: { version: 1, criteria: [] } }],
    ]);
  });
});
