import { definePrincipal } from '@sirius/auth-nest';
import type { VerifiedIdentity } from '@sirius/identity';
import { permissionsFor, ROLES, type Permission } from './permissions.js';

interface PrincipalBase {
  /** Identity-provider object ID (Entra `oid`): the stable key for audit and assignments. */
  userId: string;
  /** Sign-in name, for display and audit text only. */
  username: string | null;
  name: string | null;
  roles: readonly string[];
}

/**
 * The authenticated caller. `scope` says whose data they may touch (R1-01, R2-12): Sirius
 * roles are group-wide; everyone else is limited to the subsidiaries in `entityIds`.
 */
export type Principal = PrincipalBase &
  ({ scope: 'group' } | { scope: 'entity'; entityIds: readonly string[] });

/** Typed access to the caller of the current request. */
export const principal = definePrincipal<Principal>();

const GROUP_ROLES: ReadonlySet<string> = new Set([ROLES.admin, ROLES.reviewer, ROLES.executive]);

/**
 * Maps a verified token to the PeopleForge caller. Entity assignments for subsidiary users
 * come from the data model (ADR-002, pending); until then they are scoped to no entities, so
 * a subsidiary user can sign in but sees no subsidiary data (deny by default).
 */
export function principalFromIdentity(identity: VerifiedIdentity): Principal {
  const base: PrincipalBase = {
    userId: identity.subject,
    username: identity.username,
    name: identity.name,
    roles: identity.roles,
  };
  return identity.roles.some((role) => GROUP_ROLES.has(role))
    ? { ...base, scope: 'group' }
    : { ...base, scope: 'entity', entityIds: [] };
}

/** Effective permissions of a caller: the union over their roles; unknown roles grant nothing. */
export function permissionsOfPrincipal(caller: Principal): ReadonlySet<Permission> {
  return permissionsFor(caller.roles);
}
