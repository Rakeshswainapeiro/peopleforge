import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { serverEnv } from '@/server/env';

/**
 * The API no longer accepts the session's token (revoked or expired at the provider): end the
 * local session and explain on the sign-in page. GET because pages redirect here; the worst a
 * forged link can do is sign someone out.
 */
export async function GET(request: Request): Promise<Response> {
  const response = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
  const target = NextResponse.redirect(
    new URL('/sign-in?error=session_expired', serverEnv().AUTH_URL),
  );
  for (const cookie of response.headers.getSetCookie()) target.headers.append('set-cookie', cookie);
  return target;
}
