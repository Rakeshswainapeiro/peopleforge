import type { Scope } from '@peopleforge/db';
import { definePrincipal } from '@sirius/auth-nest';
import type { VerifiedIdentity } from '@sirius/identity';
import { permissionsFor, ROLES, type Permission } from '@peopleforge/contracts';

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

/** Sirius roles (Admin, Reviewer, Executive) see every subsidiary (ADR-002 §4). */
export function hasGroupRole(roles: readonly string[]): boolean {
  return roles.some((role) => GROUP_ROLES.has(role));
}

/**
 * Maps a verified token to the PeopleForge caller. Group roles ignore assignments; everyone
 * else is limited to `assignedEntityIds` from core.user_entity — none means no subsidiary data
 * (deny by default).
 */
export function principalFromIdentity(
  identity: VerifiedIdentity,
  assignedEntityIds: readonly string[],
): Principal {
  const base: PrincipalBase = {
    userId: identity.subject,
    username: identity.username,
    name: identity.name,
    roles: identity.roles,
  };
  return hasGroupRole(identity.roles)
    ? { ...base, scope: 'group' }
    : { ...base, scope: 'entity', entityIds: [...assignedEntityIds] };
}

/** The Row-Level Security scope every query of this caller runs under (ADR-002). */
export function scopeOf(caller: Principal): Scope {
  return caller.scope === 'group'
    ? { userId: caller.userId, kind: 'group' }
    : { userId: caller.userId, kind: 'entity', entityIds: caller.entityIds };
}

/** Effective permissions of a caller: the union over their roles; unknown roles grant nothing. */
export function permissionsOfPrincipal(caller: Principal): ReadonlySet<Permission> {
  return permissionsFor(caller.roles);
}
