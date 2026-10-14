import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IntegrationError } from './errors.js';
import { assertSafeKey, type ObjectStore } from './object-store.js';

/**
 * Object store on a local directory, for development and tests only (the API refuses it in
 * UAT and production). Files are written owner-read/write only and never overwritten.
 */
export function createFilesystemObjectStore(root: string): ObjectStore {
  /** Throws TypeError for an unsafe key: a programming error, not an unavailable store. */
  const fileFor = (key: string) => {
    assertSafeKey(key);
    return path.join(root, key);
  };
  async function attempt<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      // The error code only (ENOENT, EEXIST …): never the path, which would leak the layout.
      const code = (error as { code?: unknown }).code;
      throw new IntegrationError('object_store', typeof code === 'string' ? code : 'failed');
    }
  }
  /* eslint-disable security/detect-non-literal-fs-filename -- every path is the configured root or comes from fileFor, which only accepts keys matching assertSafeKey */
  return {
    put: async (key, body) => {
      const file = fileFor(key);
      await attempt(async () => {
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, body, { mode: 0o600, flag: 'wx' });
      });
    },
    get: async (key) => {
      const file = fileFor(key);
      return attempt(() => readFile(file));
    },
    remove: async (key) => {
      const file = fileFor(key);
      await attempt(async () => {
        await rm(file, { force: true });
      });
    },
    ping: () =>
      attempt(async () => {
        await mkdir(root, { recursive: true, mode: 0o700 });
        await stat(root);
      }),
  };
  /* eslint-enable security/detect-non-literal-fs-filename */
}
