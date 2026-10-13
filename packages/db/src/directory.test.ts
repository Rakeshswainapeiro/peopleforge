import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import { createEntityDirectory } from './directory.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL } from './test-support/db.js';

let handle: DatabaseHandle;

beforeAll(async () => {
  await resetCoreDatabase();
  handle = createDatabase({ connectionString: TEST_APP_URL });
});

afterAll(async () => {
  await handle.close();
});

describe('entity directory (R1-01, R2-12)', () => {
  it('returns the entities a user is assigned to', async () => {
    const directory = createEntityDirectory(handle.db);
    await expect(directory.assignedEntityIds(SEED_ASSIGNMENTS[1].userId)).resolves.toEqual([
      SEED_ENTITIES[1].id,
    ]);
  });

  it('returns nothing for a user with no assignments', async () => {
    const directory = createEntityDirectory(handle.db);
    await expect(directory.assignedEntityIds('unknown-user')).resolves.toEqual([]);
  });

  it('lists every entity for group scope and only assigned ones for entity scope', async () => {
    const directory = createEntityDirectory(handle.db);
    const all = await directory.entities({ userId: 'admin', kind: 'group' });
    expect(all.map((entity) => entity.code)).toEqual(['SUB-A', 'SUB-B', 'SUB-C']);
    expect(all[0]?.name).toEqual({ en: 'Subsidiary A' });
    const own = await directory.entities({
      userId: SEED_ASSIGNMENTS[0].userId,
      kind: 'entity',
      entityIds: [SEED_ENTITIES[0].id],
    });
    expect(own.map((entity) => entity.code)).toEqual(['SUB-A']);
  });
});
