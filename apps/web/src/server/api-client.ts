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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as multipart/form-data (file uploads); fetch sets the boundary. */
  form?: FormData;
  idempotencyKey?: string;
  /** Overrides the configured timeout, e.g. for an upload that is scanned before the answer. */
  timeoutMs?: number;
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
  const payload = init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body));
  try {
    const response = await fetchImpl(`${config.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      ...(payload === undefined ? {} : { body: payload }),
      signal: AbortSignal.timeout(init.timeoutMs ?? config.timeoutMs),
      cache: 'no-store',
    });
    if (response.status === 401) return { kind: 'unauthenticated' };
    // 204 No Content (e.g. a removed file) has no body: it is validated as null.
    const body: unknown = response.status === 204 ? null : await response.json();
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

export type DownloadResult =
  | { kind: 'ok'; response: Response }
  | { kind: 'unauthenticated' }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

/**
 * A file from the API (evidence downloads, ADR-010), as the raw response so the body streams
 * through to the browser instead of being buffered here.
 */
export async function apiDownload(
  config: ApiClientConfig,
  accessToken: string,
  path: string,
  timeoutMs = config.timeoutMs,
): Promise<DownloadResult> {
  const fetchImpl = config.fetch ?? fetch;
  try {
    const response = await fetchImpl(`${config.apiUrl}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (response.ok) return { kind: 'ok', response };
    await response.body?.cancel();
    if (response.status === 401) return { kind: 'unauthenticated' };
    // 400 (malformed ID), 403 and 404 all mean "no such file for you".
    if (response.status < 500) return { kind: 'not_found' };
    return { kind: 'unavailable' };
  } catch {
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
