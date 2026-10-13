import { describe, expect, it, vi } from 'vitest';
import { getAuth } from '@/server/auth';
import { GET, POST } from './route';

vi.mock('@/server/auth', () => ({ getAuth: vi.fn() }));

describe('/api/auth/*', () => {
  it('hands GET and POST requests to Better Auth', async () => {
    const handler = vi.fn(() => Promise.resolve(new Response('ok')));
    vi.mocked(getAuth).mockReturnValue({ handler } as never);
    const get = new Request('http://localhost:3000/api/auth/callback/sirius?code=x');
    const post = new Request('http://localhost:3000/api/auth/sign-out', { method: 'POST' });
    expect(await (await GET(get)).text()).toBe('ok');
    expect(await (await POST(post)).text()).toBe('ok');
    expect(handler).toHaveBeenNthCalledWith(1, get);
    expect(handler).toHaveBeenNthCalledWith(2, post);
  });
});
