import type { Permission } from '@peopleforge/contracts';
import type { IconName } from '@peopleforge/ui';
import type { MessageKey } from '@/i18n/translator';

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: IconName;
  /** Shown when the viewer has any of these; omitted: everyone signed in. */
  anyOf?: readonly Permission[];
  /** Hidden when the viewer has any of these (e.g. the plain "Home" for request readers). */
  noneOf?: readonly Permission[];
  /**
   * Other pages that belong to this item. `*` stands for one path segment, and a pattern also
   * covers the pages below it: `/requests/*` → a request and its employees.
   */
  activeFor?: readonly string[] | undefined;
  /** Shows the unread notification count (the bell). */
  showsUnread?: boolean;
}

/** A request's pages belong to My Request (Figma), its draft editor to New Request. */
const REQUEST_PAGES = ['/requests/*'];

/**
 * Portal navigation (design: app shell). Visibility is a convenience only: every page and API
 * call re-checks the permission server-side. "/" is labelled by role: My Request for those who
 * prepare requests, Increment requests for Sirius HR, Home for everyone else.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/',
    label: 'nav.myRequests',
    icon: 'home',
    anyOf: ['increment_request:create'],
    activeFor: REQUEST_PAGES,
  },
  {
    href: '/',
    label: 'nav.requests',
    icon: 'home',
    anyOf: ['increment_request:read'],
    noneOf: ['increment_request:create'],
    activeFor: REQUEST_PAGES,
  },
  {
    href: '/',
    label: 'nav.home',
    icon: 'home',
    noneOf: ['increment_request:create', 'increment_request:read'],
  },
  {
    href: '/requests/new',
    label: 'nav.newRequest',
    icon: 'file',
    anyOf: ['increment_request:create'],
    // Figma: the draft editor keeps "New Request" selected.
    activeFor: ['/requests/*/edit'],
  },
  {
    href: '/review',
    label: 'nav.reviewQueue',
    icon: 'clipboard',
    anyOf: ['increment_request:review'],
    // Reviewing an employee (Figma "Review employee") belongs to the queue for reviewers.
    activeFor: ['/requests/*/employees/*'],
  },
  {
    href: '/conversations',
    label: 'nav.conversations',
    icon: 'message',
    anyOf: ['increment_request:review', 'increment_request:submit'],
  },
  { href: '/notifications', label: 'nav.notifications', icon: 'bell', showsUnread: true },
  {
    href: '/audit',
    label: 'nav.audit',
    icon: 'clock',
    anyOf: ['audit:read'],
  },
  {
    href: '/analytics',
    label: 'nav.analytics',
    icon: 'trend',
    // Comparing subsidiaries: Sirius HR only (the page and the API check group scope too).
    anyOf: ['increment_request:review'],
  },
  // Group employee data (R2): employee data, uploads, data quality and the raw extract.
  {
    href: '/group/employees',
    label: 'nav.groupEmployees',
    icon: 'users',
    anyOf: ['employee_data:read'],
  },
  {
    href: '/group/upload',
    label: 'nav.groupUpload',
    icon: 'upload',
    anyOf: ['employee_data:upload'],
  },
  {
    href: '/group/uploads',
    label: 'nav.groupUploads',
    icon: 'layers',
    anyOf: ['employee_data:read'],
  },
  {
    href: '/group/quality',
    label: 'nav.groupQuality',
    icon: 'flag',
    anyOf: ['employee_data:read'],
  },
  {
    href: '/group/extract',
    label: 'nav.groupExtract',
    icon: 'database',
    anyOf: ['employee_data:extract_raw'],
  },
  {
    href: '/settings',
    label: 'nav.settings',
    icon: 'sliders',
    anyOf: ['criteria:configure', 'template:configure'],
  },
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
  return NAV_ITEMS.filter(
    (item) =>
      hasAnyPermission(granted, item.anyOf) &&
      !(item.noneOf ?? []).some((permission) => granted.includes(permission)),
  );
}

function segments(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '');
}

/**
 * How well a pattern covers a path: 0 when it doesn't; otherwise more for longer and more
 * literal patterns, so the most specific item wins (`/requests/new` beats `/requests/*`).
 */
function matchScore(pathname: string, pattern: string): number {
  const path = segments(pathname);
  const parts = segments(pattern);
  if (parts.length > path.length) return 0;
  let score = 1;
  for (const [index, part] of parts.entries()) {
    if (part === '*') score += 1;
    else if (part === path.at(index)) score += 2;
    else return 0;
  }
  return score;
}

/**
 * The href of the item the current page belongs to: its own page (Home only exactly), its
 * sub-pages, or an `activeFor` pattern; the most specific match wins. Undefined for pages no item
 * owns (e.g. "Session ended").
 */
export function activeHref(
  pathname: string,
  items: readonly Pick<NavItem, 'href' | 'activeFor'>[],
): string | undefined {
  let best: { href: string; score: number } | undefined;
  for (const item of items) {
    const patterns = [...(item.href === '/' ? [] : [item.href]), ...(item.activeFor ?? [])];
    const score = Math.max(
      item.href === '/' && pathname === '/' ? 1 : 0,
      ...patterns.map((pattern) => matchScore(pathname, pattern)),
    );
    if (score > 0 && (best === undefined || score > best.score)) best = { href: item.href, score };
  }
  return best?.href;
}
