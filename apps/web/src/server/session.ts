import { getProviderAccessToken } from '@sirius/auth-better';
import { headers } from 'next/headers';
import { fetchMe, type MeResult } from './api-client';
import { getAuth, type Auth } from './auth';
import { serverEnv } from './env';

/** The signed-in user's session, or null. Read-only: Server Components can't set cookies. */
export async function currentSession(): ReturnType<Auth['api']['getSession']> {
  return getAuth().api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });
}

export type ViewerResult = MeResult | { kind: 'signed_out' };

/**
 * Who is looking at the page, as the API sees them. `signed_out`: no session.
 * `unauthenticated`: a session exists but is no longer usable (token not renewable or refused
 * by the API) — end it via /session-ended.
 */
export async function currentViewer(): Promise<ViewerResult> {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  });
  if (session === null) return { kind: 'signed_out' };
  const bearer = await getProviderAccessToken(getAuth(), requestHeaders);
  // The session exists but its provider token can't be renewed (e.g. signed out at the
  // identity provider): the caller must end the session, or / and /sign-in redirect forever.
  if (bearer === null) return { kind: 'unauthenticated' };
  const env = serverEnv();
  return fetchMe(
    { apiUrl: env.PEOPLEFORGE_API_URL, timeoutMs: env.PEOPLEFORGE_API_TIMEOUT_MS },
    bearer,
  );
}
