import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cn, variantClass } from './cn.js';
import { PlainLink } from './link.js';

describe('cn', () => {
  it('joins truthy class names only', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });
});

describe('variantClass', () => {
  it('returns the classes for a key, and nothing for an unknown one', () => {
    const table = new Map([['primary', 'bg-brand-600']]);
    expect(variantClass(table, 'primary')).toBe('bg-brand-600');
    expect(variantClass(table, 'nope')).toBe('');
  });
});

describe('PlainLink', () => {
  it('renders an anchor with the given attributes', () => {
    render(
      <PlainLink href="/x" aria-current="page" className="c">
        Go
      </PlainLink>,
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toHaveAttribute('href', '/x');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('c');
  });
});
