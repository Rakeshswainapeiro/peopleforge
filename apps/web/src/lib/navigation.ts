import type { Permission } from '@peopleforge/contracts';
import type { IconName } from '@peopleforge/ui';
import type { MessageKey } from '@/i18n/translator';

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: IconName;
  /** Shown when the viewer has any of these; omitted: everyone signed in. */
  anyOf?: readonly Permission[];
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
  },
  { href: '/notifications', label: 'nav.notifications', icon: 'bell' },
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

/** Home matches exactly; other items also match their sub-pages (e.g. /reports/rp-01). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
