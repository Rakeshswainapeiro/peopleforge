import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  integrationsEnvIssues,
  IntegrationsEnvSchema,
  malwareScannerFromEnv,
  objectStoreFromEnv,
} from './env.js';

const S3 = {
  OBJECT_STORE_DRIVER: 's3',
  S3_REGION: 'me-central-1',
  S3_BUCKET: 'peopleforge-evidence',
  S3_ACCESS_KEY_ID: 'id',
  S3_SECRET_ACCESS_KEY: 'secret',
  MALWARE_SCANNER: 'clamav',
  CLAMAV_HOST: 'clamd',
};

const parse = (source: Record<string, string>) => IntegrationsEnvSchema.parse(source);

describe('IntegrationsEnvSchema', () => {
  it('applies defaults', () => {
    expect(parse(S3)).toMatchObject({
      OBJECT_STORE_TIMEOUT_MS: 10_000,
      S3_FORCE_PATH_STYLE: true,
      CLAMAV_PORT: 3310,
      CLAMAV_TIMEOUT_MS: 15_000,
    });
    expect(parse({ ...S3, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('refuses unknown drivers, bad bucket names and non-HTTP endpoints', () => {
    const fails = (overrides: Record<string, string>) =>
      IntegrationsEnvSchema.safeParse({ ...S3, ...overrides }).success;
    expect(fails({ OBJECT_STORE_DRIVER: 'ftp' })).toBe(false);
    expect(fails({ MALWARE_SCANNER: 'trust-me' })).toBe(false);
    expect(fails({ S3_BUCKET: 'Bad_Bucket' })).toBe(false);
    expect(fails({ S3_ENDPOINT: 'file:///etc' })).toBe(false);
  });
});

describe('integrationsEnvIssues', () => {
  it('passes a complete S3 + ClamAV setup, strict or not', () => {
    expect(integrationsEnvIssues(parse(S3), true)).toEqual([]);
    expect(
      integrationsEnvIssues(parse({ ...S3, S3_ENDPOINT: 'https://s3.example.ae' }), true),
    ).toEqual([]);
  });

  it('names what each driver still needs', () => {
    expect(
      integrationsEnvIssues(
        parse({ OBJECT_STORE_DRIVER: 's3', MALWARE_SCANNER: 'clamav' }),
        false,
      ).map((issue) => issue.key),
    ).toEqual([
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'CLAMAV_HOST',
    ]);
    expect(
      integrationsEnvIssues(
        parse({ OBJECT_STORE_DRIVER: 'filesystem', MALWARE_SCANNER: 'none' }),
        false,
      ),
    ).toEqual([{ key: 'OBJECT_STORE_DIR', message: 'required' }]);
  });

  it('allows local disk, no scanning and plain HTTP only outside UAT and production', () => {
    const local = parse({
      OBJECT_STORE_DRIVER: 'filesystem',
      OBJECT_STORE_DIR: '/tmp/pf',
      MALWARE_SCANNER: 'none',
    });
    expect(integrationsEnvIssues(local, false)).toEqual([]);
    expect(integrationsEnvIssues(local, true)).toEqual([
      { key: 'OBJECT_STORE_DRIVER', message: 's3 only' },
      { key: 'MALWARE_SCANNER', message: 'clamav only' },
    ]);
    const minio = parse({ ...S3, S3_ENDPOINT: 'http://localhost:9000' });
    expect(integrationsEnvIssues(minio, false)).toEqual([]);
    expect(integrationsEnvIssues(minio, true)).toEqual([
      { key: 'S3_ENDPOINT', message: 'https only' },
    ]);
  });
});

describe('building adapters from the environment', () => {
  it('builds a filesystem store that works', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pf-env-'));
    const store = objectStoreFromEnv(
      parse({ OBJECT_STORE_DRIVER: 'filesystem', OBJECT_STORE_DIR: dir, MALWARE_SCANNER: 'none' }),
    );
    await store.put('k', Buffer.from('x'), 'text/plain');
    await expect(store.get('k')).resolves.toEqual(Buffer.from('x'));
    await rm(dir, { recursive: true, force: true });
  });

  it('builds an S3 store, and refuses to when settings are missing', () => {
    const store = objectStoreFromEnv(parse({ ...S3, S3_ENDPOINT: 'http://localhost:9000' }));
    expect(typeof store.put).toBe('function');
    expect(() =>
      objectStoreFromEnv(parse({ OBJECT_STORE_DRIVER: 's3', MALWARE_SCANNER: 'none' })),
    ).toThrow('S3_BUCKET is required');
  });

  it('builds ClamAV or, for development, the no-scan scanner', async () => {
    expect(malwareScannerFromEnv(parse(S3)).engine).toBe('clamav');
    const none = malwareScannerFromEnv(parse({ ...S3, MALWARE_SCANNER: 'none' }));
    expect(none.engine).toBe('none');
    await expect(none.scan(Buffer.from('anything'))).resolves.toEqual({ clean: true });
    await expect(none.ping()).resolves.toBeUndefined();
  });
});
