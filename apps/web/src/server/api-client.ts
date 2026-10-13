import { MeSchema, type Me } from '@peopleforge/access';

export type { Me };

export type MeResult =
  { kind: 'ok'; me: Me } | { kind: 'unauthenticated' } | { kind: 'unavailable' };

export interface ApiClientConfig {
  apiUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

/**
 * The signed-in user's identity, scope and permissions from the PeopleForge API. The access
 * token goes server-to-server only; it is never sent to the browser.
 */
export async function fetchMe(config: ApiClientConfig, accessToken: string): Promise<MeResult> {
  const fetchImpl = config.fetch ?? fetch;
  try {
    const response = await fetchImpl(`${config.apiUrl}/api/v1/me`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: 'no-store',
    });
    if (response.status === 401) return { kind: 'unauthenticated' };
    if (!response.ok) return { kind: 'unavailable' };
    const parsed = MeSchema.safeParse(await response.json());
    return parsed.success ? { kind: 'ok', me: parsed.data } : { kind: 'unavailable' };
  } catch {
    // Timeouts and connection failures: show "temporarily unavailable", not a crash.
    return { kind: 'unavailable' };
  }
}
