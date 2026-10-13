import { describe, expect, it, vi } from 'vitest';
import { getAuth } from '@/server/auth';
import { GET } from './route';

vi.mock('@/server/auth', () => ({ getAuth: vi.fn() }));
vi.mock('@/server/env', () => ({ serverEnv: () => ({ AUTH_URL: 'http://localhost:3000' }) }));

describe('GET /session-ended', () => {
  it('ends the local session and explains on the sign-in page', async () => {
    const signedOut = new Response(null, {
      headers: [['set-cookie', 'peopleforge.session_token=; Max-Age=0; Path=/; HttpOnly']],
    });
    const signOut = vi.fn().mockResolvedValue(signedOut);
    vi.mocked(getAuth).mockReturnValue({ api: { signOut } } as never);

    const request = new Request('http://localhost:3000/session-ended', {
      headers: { cookie: 'peopleforge.session_token=abc' },
    });
    const response = await GET(request);

    expect(signOut).toHaveBeenCalledWith({ headers: request.headers, asResponse: true });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/sign-in?error=session_expired',
    );
    expect(response.headers.get('set-cookie')).toContain('peopleforge.session_token=; Max-Age=0');
  });
});
