import { afterEach, describe, expect, it } from 'vitest';
import { lockPageScroll } from './scroll-lock.js';

function rootWithScrollbar(width: number): HTMLElement {
  const root = document.createElement('div');
  Object.defineProperty(root, 'clientWidth', { value: window.innerWidth - width });
  return root;
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('lockPageScroll', () => {
  it('hides overflow and pads by the scrollbar width, then restores the page as it was', () => {
    const root = rootWithScrollbar(15);
    root.style.paddingInlineEnd = '4px';
    const unlock = lockPageScroll(root);
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.paddingInlineEnd).toBe('15px');
    unlock();
    expect(root.style.overflow).toBe('');
    expect(root.style.paddingInlineEnd).toBe('4px');
  });

  it('adds no padding with overlay scrollbars (no width), and defaults to the document', () => {
    const root = rootWithScrollbar(0);
    lockPageScroll(root);
    expect(root.style.paddingInlineEnd).toBe('');
    const unlock = lockPageScroll();
    expect(document.documentElement.style.overflow).toBe('hidden');
    unlock();
    expect(document.documentElement.style.overflow).toBe('');
  });
});
