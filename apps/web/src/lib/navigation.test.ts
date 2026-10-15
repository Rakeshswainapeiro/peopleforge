import { describe, expect, it } from 'vitest';
import { activeHref, NAV_ITEMS, visibleNavItems } from './navigation';

const ID = '34230d44-59a7-4faf-9f69-4025ab34481f';
const LINE = '22222222-2222-4222-8222-222222222221';

describe('visibleNavItems', () => {
  it('shows subsidiary HR "My Request" and everything else it can use', () => {
    const items = visibleNavItems([
      'increment_request:create',
      'increment_request:read',
      'report:read_operational',
    ]);
    expect(items.map((item) => [item.href, item.label])).toEqual([
      ['/', 'nav.myRequests'],
      ['/requests/new', 'nav.newRequest'],
      ['/notifications', 'nav.notifications'],
      ['/reports', 'nav.reports'],
    ]);
  });

  it('shows Sirius HR "Increment requests", without New Request', () => {
    const items = visibleNavItems(['increment_request:read', 'report:read_executive']);
    expect(items.map((item) => [item.href, item.label])).toEqual([
      ['/', 'nav.requests'],
      ['/notifications', 'nav.notifications'],
      ['/reports', 'nav.reports'],
    ]);
  });

  it('shows only Home and Notifications without permissions', () => {
    expect(visibleNavItems([]).map((item) => item.label)).toEqual([
      'nav.home',
      'nav.notifications',
    ]);
  });
});

describe('activeHref', () => {
  const preparer = visibleNavItems([
    'increment_request:create',
    'increment_request:read',
    'report:read_operational',
  ]);

  it.each([
    ['/', '/'],
    // A submitted request's page and its employees belong to My Request (Figma).
    [`/requests/${ID}`, '/'],
    [`/requests/${ID}/employees/${LINE}`, '/'],
    // A new request and a draft being edited belong to New Request.
    ['/requests/new', '/requests/new'],
    [`/requests/${ID}/edit`, '/requests/new'],
    ['/notifications', '/notifications'],
    ['/reports/rp-01', '/reports'],
    ['/reportsx', undefined],
    ['/session-ended', undefined],
  ])('%s → %s', (pathname, expected) => {
    expect(activeHref(pathname, preparer)).toBe(expected);
  });

  it('falls back to My Request for a draft when New Request isn’t shown', () => {
    const reader = visibleNavItems(['increment_request:read']);
    expect(activeHref(`/requests/${ID}/edit`, reader)).toBe('/');
  });

  it('lists every item once per role (no duplicate hrefs shown together)', () => {
    for (const permissions of [
      [],
      ['increment_request:read'],
      ['increment_request:create', 'increment_request:read'],
    ] as const) {
      const hrefs = visibleNavItems(permissions).map((item) => item.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
    expect(NAV_ITEMS.length).toBeGreaterThan(4);
  });
});
