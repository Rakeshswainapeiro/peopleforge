import type { Permission } from '@peopleforge/contracts';
import type { IconName } from '@peopleforge/ui';
import type { MessageKey } from '@/i18n/translator';

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: IconName;
  /** Shown when the viewer has any of these; omitted: everyone signed in. */
  anyOf?: readonly Permission[];
  /** Other path prefixes that belong to this item (e.g. a draft being edited → New Request). */
  alsoActiveFor?: readonly string[] | undefined;
  /** Shows the unread notification count (the bell). */
  showsUnread?: boolean;
}

/**
 * Portal navigation (design: app shell). Visibility is a convenience only: every page and API
 * call re-checks the permission server-side.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'nav.home', icon: 'home' },
  {
    href: '/requests/new',
    label: 'nav.newRequest',
    icon: 'file',
    anyOf: ['increment_request:create'],
    // Figma: the draft editor keeps "New Request" selected.
    alsoActiveFor: ['/requests'],
  },
  { href: '/notifications', label: 'nav.notifications', icon: 'bell', showsUnread: true },
  {
    href: '/reports',
    label: 'nav.reports',
    icon: 'chart',
    anyOf: ['report:read_operational', 'report:read_executive'],
  },
];

export function hasAnyPermission(
  granted: readonly Permission[],
  anyOf: readonly Permission[] | undefined,
): boolean {
  return anyOf === undefined || anyOf.some((permission) => granted.includes(permission));
}

export function visibleNavItems(granted: readonly Permission[]): NavItem[] {
  return NAV_ITEMS.filter((item) => hasAnyPermission(granted, item.anyOf));
}

function underPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Home matches exactly; other items match their own sub-pages (e.g. /reports/rp-01) and any
 * `alsoActiveFor` prefix (e.g. /requests/<id> for New Request).
 */
export function isActivePath(
  pathname: string,
  item: Pick<NavItem, 'href' | 'alsoActiveFor'>,
): boolean {
  if (item.href === '/') return pathname === '/';
  return [item.href, ...(item.alsoActiveFor ?? [])].some((prefix) => underPath(pathname, prefix));
}
