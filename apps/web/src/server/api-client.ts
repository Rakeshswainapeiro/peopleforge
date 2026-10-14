import { MeSchema, type Me } from '@peopleforge/contracts';
import { ApiErrorSchema, type ErrorCode, type ErrorDetail } from '@sirius/shared-types';
import type { z } from 'zod';

export type { Me };

export type MeResult =
  { kind: 'ok'; me: Me } | { kind: 'unauthenticated' } | { kind: 'unavailable' };

export interface ApiClientConfig {
  apiUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

/**
 * Outcome of an API call. `error`: the API refused the request with the documented error shape
 * (validation, not found, conflict …). `unavailable`: no usable answer (network, timeout, 5xx,
 * unexpected body) — shown as "temporarily unavailable", never a crash.
 */
export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }
  | { kind: 'error'; status: number; code: ErrorCode; details: ErrorDetail[] };

export interface ApiRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
}

/**
 * Calls the PeopleForge API server-to-server with the user's access token (never sent to the
 * browser) and validates the response against the shared contract.
 */
export async function apiRequest<T>(
  config: ApiClientConfig,
  accessToken: string,
  path: string,
  schema: z.ZodType<T>,
  init: ApiRequestInit = {},
): Promise<ApiResult<T>> {
  const fetchImpl = config.fetch ?? fetch;
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
  };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.idempotencyKey !== undefined) headers['idempotency-key'] = init.idempotencyKey;
  try {
    const response = await fetchImpl(`${config.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: 'no-store',
    });
    if (response.status === 401) return { kind: 'unauthenticated' };
    const body: unknown = await response.json();
    if (response.ok) {
      const parsed = schema.safeParse(body);
      return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'unavailable' };
    }
    const refused = ApiErrorSchema.safeParse(body);
    if (response.status >= 500 || !refused.success) return { kind: 'unavailable' };
    return {
      kind: 'error',
      status: response.status,
      code: refused.data.error.code,
      details: refused.data.error.details ?? [],
    };
  } catch {
    // Timeouts, connection failures and non-JSON bodies.
    return { kind: 'unavailable' };
  }
}

/** The signed-in user's identity, scope and permissions. */
export async function fetchMe(config: ApiClientConfig, accessToken: string): Promise<MeResult> {
  const result = await apiRequest(config, accessToken, '/api/v1/me', MeSchema);
  switch (result.kind) {
    case 'ok':
      return { kind: 'ok', me: result.data };
    case 'unauthenticated':
      return result;
    default:
      return { kind: 'unavailable' };
  }
}
