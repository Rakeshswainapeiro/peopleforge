import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LinkProps } from '../lib/link.js';
import { Button, ButtonLink, buttonClasses } from './button.js';

describe('buttonClasses', () => {
  it('defaults to a primary, medium button with a pointer, hover and focus styles', () => {
    const classes = buttonClasses();
    expect(classes).toContain('bg-brand-600');
    expect(classes).toContain('hover:bg-brand-700');
    expect(classes).toContain('h-10');
    expect(classes).toContain('cursor-pointer');
    expect(classes).toContain('focus-visible:outline-2');
    expect(classes).toContain('transition-');
  });

  it.each([
    ['secondary', 'border-line-strong'],
    ['outline', 'border-brand-500'],
    ['dashed', 'border-dashed'],
    ['ghost', 'hover:bg-surface-muted'],
    ['danger', 'bg-danger-600'],
    ['success', 'bg-success-600'],
  ] as const)('styles the %s variant', (variant, expected) => {
    expect(buttonClasses({ variant })).toContain(expected);
  });

  it('applies size and full width', () => {
    expect(buttonClasses({ size: 'sm' })).toContain('h-8');
    // Figma "Attach File": short, with body-size text.
    expect(buttonClasses({ size: 'compact' })).toContain('h-7 gap-1.5 px-3 text-sm');
    expect(buttonClasses({ size: 'lg', fullWidth: true })).toMatch(/h-12.*w-full/);
  });

  it('presses in a little, except when stretched over a row (the click would be lost)', () => {
    expect(buttonClasses()).toContain('active:scale-[0.98]');
    const stretched = buttonClasses({ stretched: true });
    expect(stretched).toContain('after:absolute after:inset-0');
    expect(stretched).not.toContain('active:scale');
  });
});

describe('Button', () => {
  it('is a non-submitting button by default and calls onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button icon="plus" trailingIcon="chevron-down" onClick={onClick}>
        Add
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelectorAll('svg')).toHaveLength(2);
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can submit forms', () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('blocks repeat clicks while loading and announces it', async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Submitting…" icon="plus" onClick={onClick}>
        Submit
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Submit/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Submitting…' })).toBeInTheDocument();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stretches its hit area when asked', () => {
    render(<Button stretched>View</Button>);
    expect(screen.getByRole('button', { name: 'View' }).className).toContain('after:inset-0');
  });

  it('respects disabled and extra classes', () => {
    render(
      <Button disabled className="extra">
        Off
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Off' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).toHaveClass('extra');
  });
});

describe('ButtonLink', () => {
  it('renders a link styled as a button', () => {
    render(
      <ButtonLink href="/requests/new" icon="plus" className="x">
        New increment request
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'New increment request' });
    expect(link).toHaveAttribute('href', '/requests/new');
    expect(link).toHaveClass('bg-brand-600', 'x');
  });

  it('takes an accessible name when the text alone is ambiguous', () => {
    render(
      <ButtonLink href="/x" aria-label="View the status of Omar Haddad">
        View Status
      </ButtonLink>,
    );
    expect(screen.getByRole('link', { name: 'View the status of Omar Haddad' })).toHaveTextContent(
      'View Status',
    );
  });

  it('uses the app router link when given one', () => {
    function RouterLink(props: LinkProps) {
      return <a data-router="yes" {...props} />;
    }
    render(
      <ButtonLink href="/x" as={RouterLink} variant="outline">
        Respond
      </ButtonLink>,
    );
    expect(screen.getByRole('link', { name: 'Respond' })).toHaveAttribute('data-router', 'yes');
  });
});
