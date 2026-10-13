import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import { ScopeError, withScope } from './scope.js';
import { TEST_APP_URL } from './test-support/db.js';

let handle: DatabaseHandle;

beforeAll(() => {
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 1 });
});

afterAll(async () => {
  await handle.close();
});

const settings = sql<{ user_id: string; scope: string; entity_ids: string }>`
  SELECT current_setting('app.user_id') AS user_id, current_setting('app.scope') AS scope,
         current_setting('app.entity_ids') AS entity_ids`;

describe('withScope', () => {
  it('sets group scope with an empty entity list', async () => {
    const rows = await withScope(handle.db, { userId: 'u-1', kind: 'group' }, (trx) =>
      settings.execute(trx),
    );
    expect(rows.rows[0]).toEqual({ user_id: 'u-1', scope: 'group', entity_ids: '' });
  });

  it('sets entity scope with comma-separated UUIDs', async () => {
    const ids = ['00000000-0000-4000-8000-0000000e000a', '00000000-0000-4000-8000-0000000e000b'];
    const rows = await withScope(
      handle.db,
      { userId: 'u-2', kind: 'entity', entityIds: ids },
      (trx) => settings.execute(trx),
    );
    expect(rows.rows[0]).toEqual({ user_id: 'u-2', scope: 'entity', entity_ids: ids.join(',') });
  });

  it.each([
    ['empty user ID', { userId: '', kind: 'group' as const }, 'Invalid user ID'],
    ['over-long user ID', { userId: 'x'.repeat(129), kind: 'group' as const }, 'Invalid user ID'],
    [
      'entity ID that is not a UUID',
      { userId: 'u', kind: 'entity' as const, entityIds: ["a' OR 1=1"] },
      'Entity IDs must be UUIDs',
    ],
  ])('refuses an %s before touching the database', async (_label, scope, message) => {
    const work = () => Promise.resolve('ran');
    await expect(withScope(handle.db, scope, work)).rejects.toThrow(new ScopeError(message));
  });
});
