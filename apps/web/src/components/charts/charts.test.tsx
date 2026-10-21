import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarList, ColumnChart, RangeChart } from './charts';

afterEach(cleanup);

const columns = { label: 'Item', value: 'Value' };

// The SVG charts of the group dashboards [DASH-D5, D6, D8]: data readable without the picture.

describe('BarList', () => {
  it('scales bars to the largest value, keeps a sliver for small values and none for zero', () => {
    const { container } = render(
      <BarList
        label="By subsidiary"
        columns={columns}
        points={[
          { id: 'a', label: 'SUB-A', value: 200, display: '200' },
          { id: 'b', label: 'SUB-B', value: 1, display: '1' },
          { id: 'c', label: 'SUB-C', value: 0, display: '0' },
          { id: 'd', label: 'SUB-D', value: null, display: '—' },
        ]}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'By subsidiary' });
    expect(figure).toHaveAttribute('dir', 'ltr');
    const bars = Array.from(container.querySelectorAll('rect.fill-brand-500'));
    expect(bars.map((bar) => bar.getAttribute('width'))).toEqual(['100', '2', '0', '0']);
    expect(bars.at(0)?.textContent).toBe('SUB-A: 200');
    // The SVG stretches to the row's width: an rx would stretch into an ellipse, so the ends are
    // rounded by clipping the SVG itself.
    expect(bars.every((bar) => !bar.hasAttribute('rx'))).toBe(true);
    expect(bars.at(0)?.closest('svg')).toHaveClass('overflow-hidden', 'rounded-full');
    const table = screen.getByRole('table', { name: 'By subsidiary' });
    expect(
      within(table)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual(['ItemValue', 'SUB-A200', 'SUB-B1', 'SUB-C0', 'SUB-D—']);
  });

  it('draws nothing for an all-zero chart', () => {
    const { container } = render(
      <BarList
        label="Empty"
        columns={columns}
        points={[{ id: 'a', label: 'A', value: 0, display: '0' }]}
      />,
    );
    expect(container.querySelector('rect.fill-brand-500')).toHaveAttribute('width', '0');
  });
});

describe('ColumnChart', () => {
  it('draws columns, a gap for a missing month and names it in the tooltip', () => {
    const { container } = render(
      <ColumnChart
        label="Headcount trend"
        columns={columns}
        emptyLabel="No data"
        points={[
          { id: '2026-08', label: 'Aug 26', value: 10, display: '10' },
          { id: '2026-09', label: 'Sept 26', value: 20, display: '20' },
          { id: '2026-07', label: 'Jul 26', value: null, display: '—' },
        ]}
      />,
    );
    const columnsDrawn = Array.from(container.querySelectorAll('rect.fill-brand-500'));
    expect(columnsDrawn.map((rect) => rect.getAttribute('height'))).toEqual(['18', '36', '0']);
    expect(columnsDrawn.map((rect) => rect.textContent)).toEqual([
      'Aug 26: 10',
      'Sept 26: 20',
      'Jul 26: No data',
    ]);
    const labels = container.querySelectorAll('ol li');
    expect(Array.from(labels).map((item) => item.textContent)).toEqual([
      '10Aug 26',
      '20Sept 26',
      '–Jul 26',
    ]);
  });

  it('copes with no points', () => {
    render(<ColumnChart label="Nothing" columns={columns} emptyLabel="No data" points={[]} />);
    expect(screen.getByRole('figure', { name: 'Nothing' })).toBeInTheDocument();
  });
});

describe('RangeChart', () => {
  it('places each average against its band, and shows a grade without a band', () => {
    const { container } = render(
      <RangeChart
        label="Average by grade"
        columns={{ label: 'Grade', value: 'Average', band: 'Band' }}
        rows={[
          {
            id: 'G5',
            label: 'G5',
            value: 10_000,
            display: 'AED 10,000',
            band: { min: 9_000, max: 12_000 },
            bandDisplay: 'AED 9,000 – AED 12,000',
          },
          {
            id: 'G6',
            label: 'G6',
            value: 6_000,
            display: 'AED 6,000',
            band: null,
            bandDisplay: 'No band',
          },
        ]}
      />,
    );
    const bands = container.querySelectorAll('rect.fill-brand-100');
    expect(bands).toHaveLength(1);
    expect(bands[0]?.hasAttribute('rx')).toBe(false);
    expect(bands[0]).toHaveAttribute('x', '75');
    expect(bands[0]).toHaveAttribute('width', '25');
    const markers = Array.from(container.querySelectorAll('rect.fill-brand-700'));
    expect(markers.map((marker) => marker.textContent)).toEqual([
      'G5: AED 10,000',
      'G6: AED 6,000',
    ]);
    expect(markers.at(1)).toHaveAttribute('x', '49.4');
    const table = screen.getByRole('table', { name: 'Average by grade' });
    expect(
      within(table)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual(['GradeAverageBand', 'G5AED 10,000AED 9,000 – AED 12,000', 'G6AED 6,000No band']);
  });

  it('keeps a zero average at the start of the scale', () => {
    const { container } = render(
      <RangeChart
        label="Zero"
        columns={{ label: 'Grade', value: 'Average', band: 'Band' }}
        rows={[
          {
            id: 'G1',
            label: 'G1',
            value: 0,
            display: '0',
            band: { min: 0, max: 0 },
            bandDisplay: '0',
          },
        ]}
      />,
    );
    expect(container.querySelector('rect.fill-brand-700')).toHaveAttribute('x', '0');
    expect(container.querySelector('rect.fill-brand-100')).toHaveAttribute('width', '0.5');
  });
});
