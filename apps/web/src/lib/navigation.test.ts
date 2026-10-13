import { describe, expect, it } from 'vitest';
import { isActivePath, visibleNavItems } from './navigation';

describe('visibleNavItems', () => {
  it('shows subsidiary HR everything it can use', () => {
    const items = visibleNavItems(['increment_request:create', 'report:read_operational']);
    expect(items.map((item) => item.href)).toEqual([
      '/',
      '/requests/new',
      '/notifications',
      '/reports',
    ]);
  });

  it('hides New Request from roles that cannot create requests', () => {
    const items = visibleNavItems(['report:read_executive']);
    expect(items.map((item) => item.href)).toEqual(['/', '/notifications', '/reports']);
  });

  it('shows only Home and Notifications without permissions', () => {
    expect(visibleNavItems([]).map((item) => item.href)).toEqual(['/', '/notifications']);
  });
});

describe('isActivePath', () => {
  it.each([
    ['/', '/', true],
    ['/reports', '/', false],
    ['/reports', '/reports', true],
    ['/reports/rp-01', '/reports', true],
    ['/reportsx', '/reports', false],
  ])('%s is active for %s: %s', (pathname, href, expected) => {
    expect(isActivePath(pathname, href)).toBe(expected);
  });
});
