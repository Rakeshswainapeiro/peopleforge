import type { FieldCryptoError } from '@peopleforge/db';
import { createFieldCipher, parseKeyRing, type FieldCipher } from '@peopleforge/db';
import { integrationsEnvIssues, integrationsEnvShape } from '@peopleforge/integrations';
import { identityEnvShape } from '@sirius/identity';
import { LOG_LEVELS } from '@sirius/utils';
import { z } from 'zod';

export const APP_ENVS = ['dev', 'test', 'uat', 'prod'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const origin = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

const EnvSchema = z
  .object({
    // OIDC_ISSUER, OIDC_AUDIENCE, OIDC_TENANT_ID, OIDC_ALLOW_HTTP, OIDC_TIMEOUT_MS — shared
    // with every Sirius API (@sirius/identity).
    ...identityEnvShape,
    // OBJECT_STORE_*, S3_*, MALWARE_SCANNER, CLAMAV_* — evidence files (R1-04), shared with the
    // worker (@peopleforge/integrations).
    ...integrationsEnvShape,
    APP_ENV: z.enum(APP_ENVS),
    // The app role (data access only, no DDL): migrations use the owner, never the API (ADR-002).
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    // Salary field keys (ADR-008): "id:base64-32-bytes,…" and the ID used for new writes.
    DATA_ENCRYPTION_KEYS: z.string().min(1),
    DATA_ENCRYPTION_ACTIVE_KEY: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      )
      .pipe(z.array(origin)),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    REQUEST_BODY_LIMIT_KB: z.coerce.number().int().min(1).max(10240).default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    READINESS_CHECK_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(25_000),
  })
  .superRefine((env, ctx) => {
    const strict = env.APP_ENV === 'uat' || env.APP_ENV === 'prod';
    // Local-disk storage and unscanned uploads are for development only.
    for (const issue of integrationsEnvIssues(env, strict)) {
      ctx.addIssue({ code: 'custom', path: [issue.key], message: issue.message });
    }
    // UAT and production must only ever accept HTTPS origins from an explicit allow-list,
    // and must only talk to the identity provider over HTTPS.
    if (strict) {
      if (env.OIDC_ALLOW_HTTP || !env.OIDC_ISSUER.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['OIDC_ISSUER'], message: 'https only' });
      }
      if (env.CORS_ALLOWED_ORIGINS.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['CORS_ALLOWED_ORIGINS'], message: 'required' });
      }
      if (env.CORS_ALLOWED_ORIGINS.some((value) => !value.startsWith('https://'))) {
        ctx.addIssue({ code: 'custom', path: ['CORS_ALLOWED_ORIGINS'], message: 'https only' });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(readonly invalidKeys: readonly string[]) {
    // Key names only — values may be secrets and must never be echoed.
    super(`Invalid or missing environment variables: ${invalidKeys.join(', ')}`);
    this.name = 'ConfigError';
  }
}

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new ConfigError(keys);
  }
  return result.data;
}

/**
 * The salary field cipher from the key ring (ADR-008). Fails start-up with the key problem
 * ("Key k1 must be 32 bytes", never key material) rather than at the first request.
 */
export function cipherFromEnv(
  env: Pick<Env, 'DATA_ENCRYPTION_KEYS' | 'DATA_ENCRYPTION_ACTIVE_KEY'>,
): FieldCipher {
  try {
    return createFieldCipher(
      parseKeyRing(env.DATA_ENCRYPTION_KEYS, env.DATA_ENCRYPTION_ACTIVE_KEY),
    );
  } catch (error: unknown) {
    // parseKeyRing only throws FieldCryptoError, whose messages name the key ID, never key bytes.
    throw new ConfigError([`DATA_ENCRYPTION_KEYS (${(error as FieldCryptoError).message})`]);
  }
}
