import type { VerifiedIdentity } from '@sirius/identity';
import { describe, expect, it } from 'vitest';
import { ROLES } from '@peopleforge/contracts';
import { principalFromIdentity, scopeOf } from './principal.js';

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
      expect(principalFromIdentity(identity([role]), ['ignored'])).toEqual({
        userId: 'oid-1',
        username: 'user@sirius.test',
        name: 'User',
        roles: [role],
        scope: 'group',
      });
    },
  );

  it('scopes subsidiary HR, and anyone without a Sirius role, to assigned entities only', () => {
    expect(principalFromIdentity(identity([ROLES.subsidiaryHr]), ['e-1'])).toMatchObject({
      scope: 'entity',
      entityIds: ['e-1'],
    });
    expect(principalFromIdentity(identity([]), [])).toMatchObject({
      scope: 'entity',
      entityIds: [],
    });
  });

  it('keeps group scope when a subsidiary role is combined with a Sirius role', () => {
    expect(
      principalFromIdentity(identity([ROLES.subsidiaryHr, ROLES.reviewer]), ['e-1']),
    ).toMatchObject({
      scope: 'group',
    });
  });
});

describe('scopeOf [ADR-002]', () => {
  it('maps group and entity callers to the Row-Level Security scope', () => {
    const group = principalFromIdentity(identity([ROLES.admin]), []);
    const entity = principalFromIdentity(identity([ROLES.subsidiaryHr]), ['e-1']);
    expect(scopeOf(group)).toEqual({ userId: 'oid-1', userName: 'User', kind: 'group' });
    expect(scopeOf(entity)).toEqual({
      userId: 'oid-1',
      userName: 'User',
      kind: 'entity',
      entityIds: ['e-1'],
    });
  });
});
