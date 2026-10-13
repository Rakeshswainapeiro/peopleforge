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
 * Who is looking at the page, as the API sees them. Signed out when there is no session or the
 * provider token can't be renewed.
 */
export async function currentViewer(): Promise<ViewerResult> {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  });
  if (session === null) return { kind: 'signed_out' };
  const bearer = await getProviderAccessToken(getAuth(), requestHeaders);
  if (bearer === null) return { kind: 'signed_out' };
  const env = serverEnv();
  return fetchMe(
    { apiUrl: env.PEOPLEFORGE_API_URL, timeoutMs: env.PEOPLEFORGE_API_TIMEOUT_MS },
    bearer,
  );
}
