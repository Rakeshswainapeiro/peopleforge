import { z } from 'zod';
import { createFileSender, createSmtpSender, isMailbox, type EmailSender } from './email-sender.js';

const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

/**
 * Environment variables for sending email (R1-07, R1-13), used by the worker. Spread into the
 * service's schema and add `emailEnvIssues` to its refinement. The provider is pending Sirius
 * IT (A6) and must be in the approved region.
 */
export const emailEnvShape = {
  /** `smtp` (the approved provider; Mailpit locally) or `file` (.eml files, dev/test only). */
  EMAIL_TRANSPORT: z.enum(['smtp', 'file']),
  EMAIL_FILE_DIR: z.string().trim().min(1).optional(),
  /** The sender address, e.g. no-reply@hr.<sirius-domain> (A6). */
  EMAIL_FROM: z.string().trim().refine(isMailbox, 'a single email address'),
  EMAIL_FROM_NAME: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\r\n<>"]+$/u)
    .default('PeopleForge'),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  /** Implicit TLS (port 465). */
  SMTP_SECURE: flag('false'),
  /** Require STARTTLS (port 587). Only Mailpit locally runs without it. */
  SMTP_REQUIRE_TLS: flag('true'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
};

export const EmailEnvSchema = z.object(emailEnvShape);
export type EmailEnv = z.infer<typeof EmailEnvSchema>;

export interface EmailEnvIssue {
  key: keyof EmailEnv;
  message: string;
}

/**
 * Cross-field rules. `strict` (UAT and production) refuses files instead of email and any
 * SMTP connection that isn't encrypted.
 */
export function emailEnvIssues(env: EmailEnv, strict: boolean): EmailEnvIssue[] {
  const issues: EmailEnvIssue[] = [];
  if (env.EMAIL_TRANSPORT === 'file' && env.EMAIL_FILE_DIR === undefined) {
    issues.push({ key: 'EMAIL_FILE_DIR', message: 'required' });
  }
  if (env.EMAIL_TRANSPORT === 'smtp' && env.SMTP_HOST === undefined) {
    issues.push({ key: 'SMTP_HOST', message: 'required' });
  }
  if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
    issues.push({
      key: 'SMTP_PASSWORD',
      message: 'set both SMTP_USER and SMTP_PASSWORD, or neither',
    });
  }
  if (strict) {
    if (env.EMAIL_TRANSPORT !== 'smtp')
      issues.push({ key: 'EMAIL_TRANSPORT', message: 'smtp only' });
    if (!env.SMTP_SECURE && !env.SMTP_REQUIRE_TLS) {
      issues.push({ key: 'SMTP_REQUIRE_TLS', message: 'TLS required' });
    }
  }
  return issues;
}

export function emailSenderFromEnv(env: EmailEnv): EmailSender {
  const from = { address: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME };
  if (env.EMAIL_TRANSPORT === 'file') {
    // emailEnvIssues has already refused a missing folder; this guards direct callers.
    if (env.EMAIL_FILE_DIR === undefined) throw new TypeError('EMAIL_FILE_DIR is required');
    return createFileSender(env.EMAIL_FILE_DIR, from);
  }
  if (env.SMTP_HOST === undefined) throw new TypeError('SMTP_HOST is required');
  return createSmtpSender({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTls: env.SMTP_REQUIRE_TLS,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    timeoutMs: env.SMTP_TIMEOUT_MS,
    from,
  });
}
