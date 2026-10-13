import { ROLES, type EntitySummaryDto, type Me } from '@peopleforge/access';
import type { Locale } from '@sirius/shared-types';
import type { MessageKey } from '@/i18n/translator';

/** Display name: full name, then sign-in name, then the ID — never blank. */
export function displayName(me: Pick<Me, 'name' | 'username' | 'userId'>): string {
  return me.name ?? me.username ?? me.userId;
}

// Most senior first: a person holding several roles is described by the highest.
const ROLE_LABELS: readonly [string, MessageKey][] = [
  [ROLES.admin, 'roles.admin'],
  [ROLES.reviewer, 'roles.reviewer'],
  [ROLES.executive, 'roles.executive'],
  [ROLES.subsidiaryHr, 'roles.subsidiaryHr'],
];

export function roleLabel(roles: readonly string[]): MessageKey {
  return ROLE_LABELS.find(([role]) => roles.includes(role))?.[1] ?? 'roles.none';
}

/** Entity name in the viewer's language, falling back to English. */
export function entityName(entity: EntitySummaryDto, locale: Locale): string {
  return new Map(Object.entries(entity.name)).get(locale) ?? entity.name.en;
}
