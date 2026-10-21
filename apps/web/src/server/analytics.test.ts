import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTatReport, getIncrementAnalytics } from './analytics';
import { REPORT_TIMEOUT_MS } from './increment-requests';
import { callApi, downloadFromApi } from './session';

vi.mock('./session', () => ({ callApi: vi.fn(), downloadFromApi: vi.fn() }));

const CYCLE = '00000000-0000-4000-8000-00000000c026';
const ENTITY = '00000000-0000-4000-8000-0000000e000a';

beforeEach(() => {
  vi.mocked(callApi).mockResolvedValue({ kind: 'unavailable' });
  vi.mocked(downloadFromApi).mockResolvedValue({ kind: 'unavailable' });
});

describe('analytics client [R1-11, R1-12, R1-14]', () => {
  it('calls the documented paths with validated filters', async () => {
    await getIncrementAnalytics();
    await getIncrementAnalytics({ cycleId: CYCLE, entityId: ENTITY });
    expect(vi.mocked(callApi).mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/analytics/increments',
      `/api/v1/analytics/increments?cycleId=${CYCLE}&entityId=${ENTITY}`,
    ]);
    await downloadTatReport({ entityId: ENTITY, criterion: 'C3' }, 'ar');
    expect(downloadFromApi).toHaveBeenCalledWith(
      `/api/v1/reports/tat-back-and-forth?entityId=${ENTITY}&criterion=C3&format=xlsx&locale=ar`,
      REPORT_TIMEOUT_MS,
    );
    expect(() => getIncrementAnalytics({ cycleId: '../x' })).toThrow();
  });
});
