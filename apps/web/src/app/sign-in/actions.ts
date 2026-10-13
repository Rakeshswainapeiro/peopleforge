'use server';

import { DEFAULT_PROVIDER_ID } from '@sirius/auth-better';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';

export type StartSignInResult = { ok: true; url: string } | { ok: false };

/**
 * Starts organisation sign-in and returns the identity provider's URL for the browser to visit.
 * State, PKCE verifier and nonce are stored server-side; the state cookie is set via the
 * nextCookies plugin. Server Actions are POST-only with an Origin check (CSRF).
 */
export async function startSignIn(): Promise<StartSignInResult> {
  try {
    const result = await getAuth().api.signInSocial({
      body: { provider: DEFAULT_PROVIDER_ID, callbackURL: '/', errorCallbackURL: '/sign-in' },
      headers: await headers(),
    });
    return result.url === undefined ? { ok: false } : { ok: true, url: result.url };
  } catch {
    return { ok: false };
  }
}

/**
 * Ends the PeopleForge session, then the identity provider's session (RP-initiated logout),
 * which returns the browser to the sign-in page.
 */
export async function signOut(): Promise<never> {
  const result = await getAuth().api.signOut({
    body: { callbackURL: '/sign-in', disableRedirect: true },
    headers: await headers(),
  });
  redirect(result.url ?? '/sign-in');
}
