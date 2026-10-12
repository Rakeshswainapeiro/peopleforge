/**
 * Role → permission matrix (proposal for ADR-002; confirm roles with Sirius HR).
 *
 * Code authorises against permissions, never role names. Role names are the app-role
 * values issued by the identity provider (Entra app roles; Keycloak client roles locally).
 * Changing what a role may do is a reviewed code change, not an admin-screen setting.
 */
export const PERMISSIONS = [
  'increment_request:create',
  'increment_request:submit',
  'increment_request:review',
  'increment_request:decide',
  'evidence:upload',
  'employee_data:upload',
  'employee_data:read',
  'employee_data:read_compensation',
  'employee_data:extract_raw',
  'anomaly:resolve',
  'criteria:configure',
  'template:configure',
  'user_scope:manage',
  'report:read_operational',
  'report:read_executive',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = {
  admin: 'PeopleForge.Admin',
  reviewer: 'PeopleForge.Reviewer',
  executive: 'PeopleForge.Executive',
  subsidiaryHr: 'PeopleForge.SubsidiaryHR',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  // Subsidiary HR acts only on its own entities; that scope is enforced in the data layer.
  [ROLES.subsidiaryHr]: [
    'increment_request:create',
    'increment_request:submit',
    'evidence:upload',
    'employee_data:upload',
    'employee_data:read',
    'employee_data:read_compensation',
    'anomaly:resolve',
    'report:read_operational',
  ],
  // Sirius HR reviewers decide requests and see group-wide data.
  [ROLES.reviewer]: [
    'increment_request:review',
    'increment_request:decide',
    'employee_data:read',
    'employee_data:read_compensation',
    'employee_data:extract_raw',
    'anomaly:resolve',
    'report:read_operational',
    'report:read_executive',
    'audit:read',
  ],
  // Admins configure the system but cannot decide requests (separation of duties).
  [ROLES.admin]: [
    'criteria:configure',
    'template:configure',
    'user_scope:manage',
    'report:read_operational',
    'audit:read',
  ],
  // Executives see aggregated reporting only, never individual compensation.
  [ROLES.executive]: ['report:read_executive'],
};

function isRole(value: string): value is Role {
  return Object.hasOwn(ROLE_PERMISSIONS, value);
}

/** Union of permissions for the given roles. Unknown role names grant nothing. */
export function permissionsFor(roles: readonly string[]): ReadonlySet<Permission> {
  const granted = new Set<Permission>();
  for (const role of roles) {
    if (!isRole(role)) continue;
    for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  }
  return granted;
}

export function hasAllPermissions(
  roles: readonly string[],
  required: readonly Permission[],
): boolean {
  const granted = permissionsFor(roles);
  return required.every((permission) => granted.has(permission));
}
