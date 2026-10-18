import { emailEnvIssues, emailEnvShape } from '@peopleforge/integrations';
import { LOG_LEVELS } from '@sirius/utils';
import { z } from 'zod';

export const APP_ENVS = ['dev', 'test', 'uat', 'prod'] as const;

const EnvSchema = z
  .object({
    // EMAIL_TRANSPORT, EMAIL_FROM, SMTP_* (@peopleforge/integrations).
    ...emailEnvShape,
    APP_ENV: z.enum(APP_ENVS),
    // The worker role (ADR-012): the email outbox only, never the app role or the owner.
    WORKER_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(4),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    /** Probes only (no traffic): /health/live and /health/ready. */
    HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(4200),
    /** The web app's address, for the link in each email. */
    PORTAL_URL: z.url({ protocol: /^https?$/ }),
    OUTBOX_POLL_MS: z.coerce.number().int().min(500).max(300_000).default(5_000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),
    /** How long a claimed batch is held before another worker may take it. */
    OUTBOX_LEASE_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(300_000),
    OUTBOX_STATS_INTERVAL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),
    /** Alert when the oldest due email has waited longer than this. */
    OUTBOX_ALERT_AFTER_S: z.coerce.number().int().min(60).max(86_400).default(900),
    /** How often the configured reminder triggers are checked (R1-13). */
    REMINDER_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(900_000),
    READINESS_CHECK_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(25_000),
  })
  .superRefine((env, ctx) => {
    const strict = env.APP_ENV === 'uat' || env.APP_ENV === 'prod';
    for (const issue of emailEnvIssues(env, strict)) {
      ctx.addIssue({ code: 'custom', path: [issue.key], message: issue.message });
    }
    // A batch is sent one email at a time: the lease must outlast a batch of timeouts, or a
    // slow batch could be claimed and sent again by another worker.
    if (env.OUTBOX_LEASE_MS < env.OUTBOX_BATCH_SIZE * env.SMTP_TIMEOUT_MS * 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['OUTBOX_LEASE_MS'],
        message: 'must be at least OUTBOX_BATCH_SIZE × SMTP_TIMEOUT_MS × 2',
      });
    }
    if (strict && !env.PORTAL_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['PORTAL_URL'], message: 'https only' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(readonly invalidKeys: readonly string[]) {
    // Key names only: values may be secrets and must never be echoed.
    super(`Invalid or missing environment variables: ${invalidKeys.join(', ')}`);
    this.name = 'ConfigError';
  }
}

export function loadEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError([...new Set(result.error.issues.map((issue) => issue.path.join('.')))]);
  }
  return result.data;
}
