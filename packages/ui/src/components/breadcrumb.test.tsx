import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Breadcrumb } from './breadcrumb.js';

describe('Breadcrumb', () => {
  it('links back up the trail and marks the current page', () => {
    render(
      <Breadcrumb
        label="Breadcrumb"
        items={[{ label: 'My requests', href: '/' }, { label: 'INC-2026-0152 · Draft' }]}
      />,
    );
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'My requests' })).toHaveAttribute('href', '/');
    expect(within(trail).getByText('INC-2026-0152 · Draft')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(trail).getAllByRole('listitem')).toHaveLength(2);
  });

  it('marks only the last unlinked item as current', () => {
    render(<Breadcrumb label="Trail" items={[{ label: 'Section' }, { label: 'Page' }]} />);
    expect(screen.getByText('Section')).not.toHaveAttribute('aria-current');
  });
});
