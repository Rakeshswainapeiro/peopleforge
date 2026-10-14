import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createFilesystemObjectStore } from './filesystem-object-store.js';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof FsPromises>()),
  readFile: () => Promise.reject(new Error('no code on this one')),
}));

describe('createFilesystemObjectStore with an error that has no code', () => {
  it('reports a generic failure rather than the message', async () => {
    await expect(createFilesystemObjectStore('/unused').get('k')).rejects.toMatchObject({
      dependency: 'object_store',
      message: 'failed',
    });
  });
});
