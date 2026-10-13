import { describe, expect, it, vi } from 'vitest';
import { navigateTo } from './navigate';

describe('navigateTo', () => {
  it('performs a full-page navigation', () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    navigateTo('https://idp.test/authorize');
    expect(assign).toHaveBeenCalledWith('https://idp.test/authorize');
    vi.unstubAllGlobals();
  });
});
