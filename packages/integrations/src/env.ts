import { z } from 'zod';
import { createFilesystemObjectStore } from './filesystem-object-store.js';
import {
  createClamAvScanner,
  createUnscannedForDevelopment,
  type MalwareScanner,
} from './malware-scanner.js';
import type { ObjectStore } from './object-store.js';
import { createS3ObjectStore } from './s3-object-store.js';

const flag = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

/**
 * Environment variables for object storage and malware scanning, shared by every PeopleForge
 * service that handles files (api now, worker for data uploads later). Spread into the
 * service's own schema and add `integrationsEnvIssues` to its refinement.
 */
export const integrationsEnvShape = {
  /** `s3` (any S3-compatible store: MinIO locally, the approved in-region store, A6) or `filesystem` (dev/test only). */
  OBJECT_STORE_DRIVER: z.enum(['s3', 'filesystem']),
  OBJECT_STORE_DIR: z.string().trim().min(1).optional(),
  OBJECT_STORE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  S3_REGION: z.string().trim().min(1).optional(),
  S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u)
    .optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Path-style URLs (bucket in the path): needed by MinIO and most S3-compatible stores. */
  S3_FORCE_PATH_STYLE: flag,
  /** `clamav`, or `none` to skip scanning in local development only. */
  MALWARE_SCANNER: z.enum(['clamav', 'none']),
  CLAMAV_HOST: z.string().trim().min(1).optional(),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
};

export const IntegrationsEnvSchema = z.object(integrationsEnvShape);
export type IntegrationsEnv = z.infer<typeof IntegrationsEnvSchema>;

export interface EnvIssue {
  key: keyof IntegrationsEnv;
  message: string;
}

/**
 * Cross-field rules. `strict` (UAT and production) refuses the development-only options: files
 * on local disk and unscanned uploads, and plain-HTTP storage endpoints.
 */
export function integrationsEnvIssues(env: IntegrationsEnv, strict: boolean): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const need = (key: keyof IntegrationsEnv, value: string | undefined) => {
    if (value === undefined) issues.push({ key, message: 'required' });
  };
  if (env.OBJECT_STORE_DRIVER === 'filesystem') need('OBJECT_STORE_DIR', env.OBJECT_STORE_DIR);
  if (env.OBJECT_STORE_DRIVER === 's3') {
    need('S3_REGION', env.S3_REGION);
    need('S3_BUCKET', env.S3_BUCKET);
    need('S3_ACCESS_KEY_ID', env.S3_ACCESS_KEY_ID);
    need('S3_SECRET_ACCESS_KEY', env.S3_SECRET_ACCESS_KEY);
  }
  if (env.MALWARE_SCANNER === 'clamav') need('CLAMAV_HOST', env.CLAMAV_HOST);
  if (strict) {
    if (env.OBJECT_STORE_DRIVER !== 's3') {
      issues.push({ key: 'OBJECT_STORE_DRIVER', message: 's3 only' });
    }
    if (env.MALWARE_SCANNER !== 'clamav') {
      issues.push({ key: 'MALWARE_SCANNER', message: 'clamav only' });
    }
    if (env.S3_ENDPOINT?.startsWith('http://') === true) {
      issues.push({ key: 'S3_ENDPOINT', message: 'https only' });
    }
  }
  return issues;
}

function present(value: string | undefined, key: keyof IntegrationsEnv): string {
  // integrationsEnvIssues has already refused a missing value; this guards direct callers.
  if (value === undefined) throw new TypeError(`${key} is required`);
  return value;
}

export function objectStoreFromEnv(env: IntegrationsEnv): ObjectStore {
  if (env.OBJECT_STORE_DRIVER === 'filesystem') {
    return createFilesystemObjectStore(present(env.OBJECT_STORE_DIR, 'OBJECT_STORE_DIR'));
  }
  return createS3ObjectStore({
    bucket: present(env.S3_BUCKET, 'S3_BUCKET'),
    region: present(env.S3_REGION, 'S3_REGION'),
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    accessKeyId: present(env.S3_ACCESS_KEY_ID, 'S3_ACCESS_KEY_ID'),
    secretAccessKey: present(env.S3_SECRET_ACCESS_KEY, 'S3_SECRET_ACCESS_KEY'),
    timeoutMs: env.OBJECT_STORE_TIMEOUT_MS,
  });
}

export function malwareScannerFromEnv(env: IntegrationsEnv): MalwareScanner {
  if (env.MALWARE_SCANNER === 'none') return createUnscannedForDevelopment();
  return createClamAvScanner({
    host: present(env.CLAMAV_HOST, 'CLAMAV_HOST'),
    port: env.CLAMAV_PORT,
    timeoutMs: env.CLAMAV_TIMEOUT_MS,
  });
}
