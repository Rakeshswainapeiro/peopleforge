import type { VerifiedIdentity } from '@sirius/identity';
import { describe, expect, it } from 'vitest';
import { ROLES } from './permissions.js';
import { principalFromIdentity } from './principal.js';

function identity(roles: string[]): VerifiedIdentity {
  return {
    subject: 'oid-1',
    tenantId: 'tid-1',
    username: 'user@sirius.test',
    name: 'User',
    roles,
    expiresAt: new Date(),
  };
}

describe('principalFromIdentity', () => {
  it.each([[ROLES.admin], [ROLES.reviewer], [ROLES.executive]])(
    'gives %s group-wide scope',
    (role) => {
      expect(principalFromIdentity(identity([role]))).toEqual({
        userId: 'oid-1',
        username: 'user@sirius.test',
        name: 'User',
        roles: [role],
        scope: 'group',
      });
    },
  );

  it('scopes subsidiary HR, and anyone without a Sirius role, to assigned entities only', () => {
    expect(principalFromIdentity(identity([ROLES.subsidiaryHr]))).toMatchObject({
      scope: 'entity',
      entityIds: [],
    });
    expect(principalFromIdentity(identity([]))).toMatchObject({ scope: 'entity', entityIds: [] });
  });

  it('keeps group scope when a subsidiary role is combined with a Sirius role', () => {
    expect(principalFromIdentity(identity([ROLES.subsidiaryHr, ROLES.reviewer]))).toMatchObject({
      scope: 'group',
    });
  });
});
