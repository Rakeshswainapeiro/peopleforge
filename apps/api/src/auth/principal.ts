/**
 * The authenticated caller. `entityIds` is the set of subsidiaries whose data the caller may
 * touch (R1-01, R2-12); group-wide Sirius roles are modelled as `scope: 'group'` rather than
 * as a list of every entity, so new subsidiaries don't need user re-provisioning.
 *
 * Roles and permissions are deliberately not enumerated yet: the RBAC matrix is part of the
 * solution design (SOW-D2) awaiting sign-off.
 */
export type Principal =
  | { userId: string; roles: readonly string[]; scope: 'group' }
  | { userId: string; roles: readonly string[]; scope: 'entity'; entityIds: readonly string[] };
