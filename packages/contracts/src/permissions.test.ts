import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  hasAllPermissions,
  permissionsFor,
  type Permission,
} from './permissions.js';

const allRoles = Object.values(ROLES);

describe('role → permission matrix invariants', () => {
  it('grants only known permissions', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of allRoles) {
      for (const permission of ROLE_PERMISSIONS[role]) expect(known.has(permission)).toBe(true);
    }
  });

  it('separates configuration from decisions (no role can both)', () => {
    for (const role of allRoles) {
      const granted = permissionsFor([role]);
      expect(granted.has('criteria:configure') && granted.has('increment_request:decide')).toBe(
        false,
      );
    }
  });

  it('shows individual increment requests (salaries) only to subsidiary HR and reviewers', () => {
    const readers = allRoles.filter((role) => permissionsFor([role]).has('increment_request:read'));
    expect(readers.sort()).toEqual([ROLES.reviewer, ROLES.subsidiaryHr].sort());
  });

  it('never lets a subsidiary decide its own requests', () => {
    expect(permissionsFor([ROLES.subsidiaryHr]).has('increment_request:decide')).toBe(false);
  });

  it('keeps individual compensation away from executives', () => {
    const granted = permissionsFor([ROLES.executive]);
    expect(granted.has('employee_data:read_compensation')).toBe(false);
    expect(granted.has('employee_data:extract_raw')).toBe(false);
    expect([...granted]).toEqual(['report:read_executive']);
  });

  it('reserves raw extraction for Sirius reviewers', () => {
    const holders = allRoles.filter((role) =>
      permissionsFor([role]).has('employee_data:extract_raw'),
    );
    expect(holders).toEqual([ROLES.reviewer]);
  });
});

describe('permissionsFor', () => {
  it('returns nothing for no roles or unknown roles', () => {
    expect(permissionsFor([]).size).toBe(0);
    expect(permissionsFor(['admin', 'PeopleForge.admin', 'DealForge.Admin']).size).toBe(0);
  });

  it('ignores inherited object keys passed as role names', () => {
    expect(permissionsFor(['toString', 'constructor', '__proto__']).size).toBe(0);
  });

  it('unions permissions across roles', () => {
    const granted = permissionsFor([ROLES.admin, ROLES.executive]);
    expect(granted.has('criteria:configure')).toBe(true);
    expect(granted.has('report:read_executive')).toBe(true);
  });
});

describe('hasAllPermissions', () => {
  it('requires every listed permission', () => {
    const required: Permission[] = ['increment_request:review', 'increment_request:decide'];
    expect(hasAllPermissions([ROLES.reviewer], required)).toBe(true);
    expect(hasAllPermissions([ROLES.subsidiaryHr], required)).toBe(false);
  });

  it('is satisfied by an empty requirement', () => {
    expect(hasAllPermissions([], [])).toBe(true);
  });
});
