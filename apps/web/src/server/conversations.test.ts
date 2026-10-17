import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getThread, listConversations, postMessage } from './conversations';
import { callApi } from './session';

vi.mock('./session', () => ({ callApi: vi.fn() }));

const ID = '11111111-1111-4111-8111-111111111111';
const LINE = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.mocked(callApi).mockResolvedValue({ kind: 'unavailable' });
});

describe('conversations client [R1-08]', () => {
  it('calls the documented paths, validating IDs first', async () => {
    await getThread(ID, LINE);
    await postMessage(ID, LINE, 'Signed?', 'key-12345678');
    await listConversations();
    await listConversations({ filter: 'all', page: 2, pageSize: 25 });
    const path = `/api/v1/increment-requests/${ID}/lines/${LINE}/messages`;
    expect(vi.mocked(callApi).mock.calls.map(([url, , init]) => [url, init])).toEqual([
      [path, undefined],
      [path, { method: 'POST', body: { body: 'Signed?' }, idempotencyKey: 'key-12345678' }],
      ['/api/v1/conversations?filter=awaiting&page=1&pageSize=10', undefined],
      ['/api/v1/conversations?filter=all&page=2&pageSize=25', undefined],
    ]);
    expect(() => getThread('../x', LINE)).toThrow();
  });
});
