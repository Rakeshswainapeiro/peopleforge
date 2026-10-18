import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAudit } from './audit';
import { callApi } from './session';

vi.mock('./session', () => ({ callApi: vi.fn() }));

beforeEach(() => {
  vi.mocked(callApi).mockResolvedValue({ kind: 'unavailable' });
});

describe('audit client [R1-15]', () => {
  it('calls the documented path with its filters, encoded', async () => {
    await listAudit();
    await listAudit({
      actor: 'oid-4',
      search: 'a&b',
      from: '2026-10-01',
      to: '2026-10-31',
      page: 2,
      pageSize: 50,
    });
    expect(vi.mocked(callApi).mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/audit?page=1&pageSize=25',
      '/api/v1/audit?actor=oid-4&search=a%26b&from=2026-10-01&to=2026-10-31&page=2&pageSize=50',
    ]);
  });
});
