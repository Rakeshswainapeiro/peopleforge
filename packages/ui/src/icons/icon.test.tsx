import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './icon.js';

describe('Icon', () => {
  it('is hidden from assistive technology by default', () => {
    const { container } = render(<Icon name="home" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
  });

  it('becomes an image with a name when labelled', () => {
    render(<Icon name="check" label="Pass" />);
    expect(screen.getByRole('img', { name: 'Pass' })).toBeInTheDocument();
  });

  it('mirrors directional icons in right-to-left layouts only', () => {
    const { container } = render(
      <>
        <Icon name="chevron-end" />
        <Icon name="check" />
      </>,
    );
    const [chevron, check] = container.querySelectorAll('svg');
    expect(chevron).toHaveClass('rtl:-scale-x-100');
    expect(check).not.toHaveClass('rtl:-scale-x-100');
  });
});
