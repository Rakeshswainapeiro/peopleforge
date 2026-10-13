import { describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { TEST_APP_URL } from './test-support/db.js';

describe('createDatabase', () => {
  it('pings a reachable database', async () => {
    const handle = createDatabase({ connectionString: TEST_APP_URL });
    await expect(handle.ping()).resolves.toBeUndefined();
    await handle.close();
  });

  it('fails the readiness ping when the database is unreachable', async () => {
    const handle = createDatabase({
      connectionString: 'postgres://nobody:x@127.0.0.1:1/none',
      poolMax: 1,
    });
    await expect(handle.ping()).rejects.toThrow();
    await handle.close();
  });
});
