import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IntegrationError } from './errors.js';
import { createFilesystemObjectStore } from './filesystem-object-store.js';

describe('createFilesystemObjectStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pf-store-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips an object, owner-only, and removes it', async () => {
    const store = createFilesystemObjectStore(path.join(dir, 'root'));
    await store.put('evidence/abc', Buffer.from('hello'), 'application/pdf');
    await expect(store.get('evidence/abc')).resolves.toEqual(Buffer.from('hello'));
    const info = await stat(path.join(dir, 'root', 'evidence', 'abc'));
    expect(info.mode & 0o777).toBe(0o600);
    await store.remove('evidence/abc');
    await expect(store.get('evidence/abc')).rejects.toMatchObject({
      dependency: 'object_store',
      message: 'ENOENT',
    });
  });

  it('never overwrites an existing object', async () => {
    const store = createFilesystemObjectStore(dir);
    await store.put('k', Buffer.from('first'), 'text/plain');
    const error = await store
      .put('k', Buffer.from('second'), 'text/plain')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ message: 'EEXIST' });
    await expect(store.get('k')).resolves.toEqual(Buffer.from('first'));
  });

  it('treats removing a missing object as done', async () => {
    const store = createFilesystemObjectStore(dir);
    await expect(store.remove('missing')).resolves.toBeUndefined();
  });

  it('refuses unsafe keys before touching the disk', async () => {
    const store = createFilesystemObjectStore(dir);
    await expect(store.get('../escape')).rejects.toThrow(TypeError);
    await expect(store.put('../escape', Buffer.from(''), 'text/plain')).rejects.toThrow(TypeError);
    await expect(store.remove('../escape')).rejects.toThrow(TypeError);
  });

  it('pings by creating the root when needed', async () => {
    const root = path.join(dir, 'new-root');
    await createFilesystemObjectStore(root).ping();
    expect((await stat(root)).isDirectory()).toBe(true);
  });

  it('reports an unusable root', async () => {
    const file = path.join(dir, 'not-a-dir');
    await writeFile(file, 'x');
    await expect(createFilesystemObjectStore(file).ping()).rejects.toBeInstanceOf(IntegrationError);
  });
});
