import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StageMeter } from './stage-meter.js';

describe('StageMeter', () => {
  it('shows the stage in words, with a decorative bar of reached segments', () => {
    const { container } = render(<StageMeter filled={1} total={5} label="Criterion 1 of 5" />);
    expect(screen.getByText('Criterion 1 of 5')).toBeVisible();
    const bar = container.querySelector('[aria-hidden="true"]');
    expect(bar?.children).toHaveLength(5);
    expect(bar?.querySelectorAll('.bg-brand-600')).toHaveLength(1);
    expect(bar).toHaveAttribute('data-filled', '1');
  });

  it('shows an empty bar before review', () => {
    const { container } = render(<StageMeter filled={0} total={5} label="Not submitted" />);
    expect(container.querySelectorAll('.bg-brand-600')).toHaveLength(0);
  });
});
