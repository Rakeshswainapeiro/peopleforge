import { webAuthEnvShape } from '@sirius/auth-better';
import { LOG_LEVELS } from '@sirius/utils';
import { z } from 'zod';

const WebEnvSchema = z
  .object({
    // AUTH_SECRET, AUTH_URL, OIDC_ISSUER, OIDC_TENANT_ID, OIDC_ALLOW_HTTP, OIDC_CLIENT_ID,
    // OIDC_CLIENT_SECRET, OIDC_SCOPES — shared with every Sirius web app (@sirius/auth-better).
    ...webAuthEnvShape,
    APP_ENV: z.enum(['dev', 'test', 'uat', 'prod']),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    /** Connects as the least-privileged app role; the sign-in tables live in schema `auth`. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    /** PeopleForge API, called server-side only with the signed-in user's access token. */
    PEOPLEFORGE_API_URL: z
      .url({ protocol: /^https?$/ })
      .transform((value) => new URL(value).origin),
    PEOPLEFORGE_API_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'uat' && env.APP_ENV !== 'prod') return;
    // Outside development, cookies are Secure-only and the identity provider is HTTPS-only.
    if (!env.AUTH_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['AUTH_URL'], message: 'https only' });
    }
    if (env.OIDC_ALLOW_HTTP || !env.OIDC_ISSUER.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['OIDC_ISSUER'], message: 'https only' });
    }
  });

export type WebEnv = z.infer<typeof WebEnvSchema>;

export class WebConfigError extends Error {
  constructor(readonly invalidKeys: readonly string[]) {
    // Key names only — values may be secrets and must never be echoed.
    super(`Invalid or missing environment variables: ${invalidKeys.join(', ')}`);
    this.name = 'WebConfigError';
  }
}

export function loadWebEnv(source: Record<string, string | undefined>): WebEnv {
  const result = WebEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new WebConfigError(keys);
  }
  return result.data;
}

let cached: WebEnv | undefined;

/**
 * Server settings, validated on first use rather than at import, so `next build` works without
 * runtime secrets. The first request after a bad deployment fails loudly with the key names.
 */
export function serverEnv(): WebEnv {
  cached ??= loadWebEnv(process.env);
  return cached;
}
