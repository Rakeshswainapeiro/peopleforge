import { createAccessPolicy } from '@sirius/auth-nest';
import type { Permission } from '@peopleforge/contracts';

/**
 * Access policy decorators, typed to PeopleForge permissions so a misspelt permission is a
 * compile error. Every route declares exactly one; the shared guard (deny by default) and
 * start-up audit live in @sirius/auth-nest (ADR-005, ADR-007).
 */
export const { Public, Authenticated, RequirePermission } = createAccessPolicy<Permission>();
