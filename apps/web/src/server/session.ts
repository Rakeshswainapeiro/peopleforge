import { getProviderAccessToken } from '@sirius/auth-better';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { z } from 'zod';
import {
  apiDownload,
  apiRequest,
  fetchMe,
  type ApiClientConfig,
  type DownloadResult,
  type ApiRequestInit,
  type ApiResult,
  type Me,
  type MeResult,
} from './api-client';
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
 * Who is looking at the page, as the API sees them; once per request (React cache).
 * `signed_out`: no session. `unauthenticated`: a session exists but is no longer usable (token not renewable or refused
 * by the API) — end it via /session-ended.
 */
export const currentViewer = cache(async (): Promise<ViewerResult> => {
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
  return fetchMe(apiConfig(), bearer);
});

function apiConfig(): ApiClientConfig {
  const env = serverEnv();
  return { apiUrl: env.PEOPLEFORGE_API_URL, timeoutMs: env.PEOPLEFORGE_API_TIMEOUT_MS };
}

/**
 * Calls the PeopleForge API as the signed-in user (pages and Server Actions). The provider
 * access token is read server-side for each call and never reaches the browser.
 */
export async function callApi<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: ApiRequestInit,
): Promise<ApiResult<T>> {
  const bearer = await getProviderAccessToken(getAuth(), await headers());
  if (bearer === null) return { kind: 'unauthenticated' };
  return apiRequest(apiConfig(), bearer, path, schema, init);
}

/**
 * Downloads a file from the API as the signed-in user (the token stays server-side). Reports
 * pass a longer timeout: large exports may take up to 60 s (NFR-PERF-01).
 */
export async function downloadFromApi(path: string, timeoutMs?: number): Promise<DownloadResult> {
  const bearer = await getProviderAccessToken(getAuth(), await headers());
  if (bearer === null) return { kind: 'unauthenticated' };
  return apiDownload(apiConfig(), bearer, path, timeoutMs);
}

/**
 * The viewer of a portal page, or null while the API is unavailable (the portal layout shows
 * the notice). Redirects when there is no usable session. Cached per request, so layout and
 * page share one /me call.
 */
export async function requireViewer(): Promise<Me | null> {
  const viewer = await currentViewer();
  if (viewer.kind === 'signed_out') redirect('/sign-in');
  if (viewer.kind === 'unauthenticated') redirect('/session-ended');
  return viewer.kind === 'ok' ? viewer.me : null;
}
