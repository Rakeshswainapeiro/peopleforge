import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postMessage } from '@/server/conversations';
import { refreshPortalShell } from '@/server/portal-shell';
import { postMessageAction } from './actions';

vi.mock('@/server/conversations', () => ({ postMessage: vi.fn() }));
vi.mock('@/server/portal-shell', () => ({ refreshPortalShell: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const REQUEST = '11111111-1111-4111-8111-111111111111';
const LINE = '22222222-2222-4222-8222-222222222221';
const KEY = 'b6a1d1c2-4d0e-4c47-9b8f-0b1d3a2f9e04-0';

function form(body: string, key = KEY): FormData {
  const data = new FormData();
  data.set('requestId', REQUEST);
  data.set('lineId', LINE);
  data.set('messageKey', key);
  data.set('body', body);
  return data;
}

beforeEach(() => {
  vi.mocked(postMessage).mockResolvedValue({ kind: 'ok', data: [] });
});

describe('postMessageAction [R1-08]', () => {
  it('sends the trimmed message and re-renders the employee page in place', async () => {
    await expect(postMessageAction({ attempt: 1 }, form('  Signed? '))).resolves.toEqual({
      attempt: 2,
    });
    expect(postMessage).toHaveBeenCalledWith(REQUEST, LINE, 'Signed?', KEY);
    expect(revalidatePath).toHaveBeenCalledWith(`/requests/${REQUEST}/employees/${LINE}`);
    expect(refreshPortalShell).toHaveBeenCalled();
  });

  it('keeps the text when the message is empty, too long, or the key is tampered with', async () => {
    await expect(postMessageAction({}, form('   '))).resolves.toEqual({
      attempt: 1,
      error: 'request.errors.messageInvalid',
      body: '   ',
    });
    await expect(postMessageAction({}, form('x'.repeat(2001)))).resolves.toMatchObject({
      error: 'request.errors.messageInvalid',
    });
    await expect(postMessageAction({}, form('Hi', '../x'))).resolves.toMatchObject({
      error: 'request.errors.messageInvalid',
    });
    const file = form('');
    file.set('body', new File(['x'], 'x.txt'));
    await expect(postMessageAction({}, file)).resolves.toMatchObject({ body: '' });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('shows the API’s refusal, and ends a dead session', async () => {
    vi.mocked(postMessage).mockResolvedValueOnce({
      kind: 'error',
      status: 409,
      code: 'CONFLICT',
      details: [{ path: 'status', code: 'not_in_review' }],
    });
    await expect(postMessageAction({}, form('Hi'))).resolves.toEqual({
      attempt: 1,
      error: 'request.errors.notInReview',
      body: 'Hi',
    });
    vi.mocked(postMessage).mockResolvedValueOnce({ kind: 'unavailable' });
    await expect(postMessageAction({}, form('Hi'))).resolves.toMatchObject({
      error: 'request.errors.generic',
    });
    vi.mocked(postMessage).mockResolvedValueOnce({ kind: 'unauthenticated' });
    await expect(postMessageAction({}, form('Hi'))).rejects.toThrow('NEXT_REDIRECT /session-ended');
  });
});
