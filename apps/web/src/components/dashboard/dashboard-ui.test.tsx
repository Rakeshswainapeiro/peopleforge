import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkSelect } from '../link-select';
import { DashboardFilters, filtersHref, SEARCH_DELAY_MS } from './dashboard-filters';
import { must } from '@/test-support/requests';
import { NeedsYourAction } from './needs-your-action';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

const CYCLE = '00000000-0000-4000-8000-00000000c026';
const router = { replace: vi.fn(), push: vi.fn() };

beforeEach(() => {
  router.replace.mockClear();
  router.push.mockClear();
  vi.mocked(useRouter).mockReturnValue(router as unknown as ReturnType<typeof useRouter>);
});

afterEach(() => {
  vi.useRealTimers();
});

function filters(hidden: Record<string, string> = { view: 'employees' }) {
  return render(
    <DashboardFilters
      hidden={hidden}
      search="Omar"
      selects={[
        {
          name: 'cycle',
          label: 'Period',
          value: CYCLE,
          options: [
            { value: CYCLE, label: 'Increment cycle 2026' },
            { value: 'all', label: 'All periods' },
          ],
        },
        {
          name: 'status',
          label: 'Status',
          value: '',
          options: [
            { value: '', label: 'All statuses' },
            { value: 'draft', label: 'Draft' },
          ],
        },
      ]}
      labels={{
        filters: 'Filter requests',
        search: 'Search',
        searchPlaceholder: 'Employee name, employee ID or request ID',
        applySearch: 'Apply',
      }}
    />,
  );
}

describe('DashboardFilters [R1-10]', () => {
  it('is a labelled GET search form that keeps the view and works without JavaScript', () => {
    const { container } = filters();
    const form = screen.getByRole('search', { name: 'Filter requests' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('Omar');
    expect(screen.getByRole('combobox', { name: 'Period' })).toHaveValue(CYCLE);
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('');
    expect(container.querySelector('input[type="hidden"][name="view"]')).toHaveValue('employees');
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveClass('sr-only');
  });

  it('applies a period or status at once, back to page 1, replacing the URL', async () => {
    filters();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'draft');
    expect(router.replace).toHaveBeenLastCalledWith(
      `/?view=employees&q=Omar&cycle=${CYCLE}&status=draft`,
      { scroll: false },
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Period' }), 'all');
    expect(router.replace).toHaveBeenLastCalledWith(
      '/?view=employees&q=Omar&cycle=all&status=draft',
      {
        scroll: false,
      },
    );
  });

  it('follows the search box once typing pauses, and Enter applies at once', () => {
    vi.useFakeTimers();
    filters({});
    const box = screen.getByRole('searchbox', { name: 'Search' });
    fireEvent.change(box, { target: { value: 'Neh' } });
    fireEvent.change(box, { target: { value: 'Neha' } });
    expect(router.replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(`/?q=Neha&cycle=${CYCLE}`, { scroll: false });

    fireEvent.change(box, { target: { value: 'Omar' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(router.replace).toHaveBeenLastCalledWith(`/?q=Omar&cycle=${CYCLE}`, { scroll: false });
    // The pending keystroke timer was cancelled by Enter.
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });
    expect(router.replace).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending search when the page goes away', () => {
    vi.useFakeTimers();
    const { unmount } = filters();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'x' } });
    unmount();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('filtersHref', () => {
  it('drops empty values and trims the rest', () => {
    const form = document.createElement('form');
    form.innerHTML =
      '<input name="q" value="  " /><input name="status" value="" /><input name="cycle" value=" all " />';
    expect(filtersHref(form)).toBe('/?cycle=all');
    form.innerHTML = '<input name="q" value="" />';
    expect(filtersHref(form)).toBe('/');
  });
});

describe('NeedsYourAction', () => {
  const labels = {
    title: 'Needs your action',
    count: '2 items need your action',
    summary: '2 drafts not submitted. Longest waiting first.',
    caption: 'Needs your action',
    type: 'Type',
    employee: 'Employee / request',
    needed: 'What’s needed',
    waiting: 'Waiting',
    overdue: 'overdue',
    showing: 'Showing 2 of 2',
    seeAll: 'See all drafts',
  };
  const row = {
    id: 'r1',
    type: { tone: 'outline' as const, label: 'Draft' },
    primary: '4 employees',
    secondary: 'INC-2026-0150',
    needed: 'Complete and submit',
    neededDetail: 'Criteria 15 of 20 complete',
    waiting: '6d',
    overdue: true,
    href: '/requests/r1/edit',
    action: 'Continue draft',
  };

  it('lists what is waiting, longest first, with the overdue ones in words too', () => {
    render(
      <NeedsYourAction
        total={2}
        rows={[row, { ...row, id: 'r2', waiting: '1d', overdue: false, href: '/requests/r2/edit' }]}
        show={<span>Show: all</span>}
        seeAllHref="/?status=draft"
        labels={labels}
      />,
    );
    const region = screen.getByRole('region', { name: 'Needs your action' });
    expect(region).toHaveTextContent('2 items need your action');
    expect(region).toHaveTextContent('Show: all');
    const table = screen.getByRole('table', { name: 'Needs your action' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const [, waitingLong, fresh] = rows;
    expect(waitingLong).toHaveTextContent('6d overdue');
    expect(fresh).not.toHaveTextContent('overdue');
    expect(within(must(waitingLong)).getByRole('link', { name: 'Continue draft' })).toHaveAttribute(
      'href',
      '/requests/r1/edit',
    );
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all drafts' })).toHaveAttribute(
      'href',
      '/?status=draft',
    );
  });
});

describe('LinkSelect', () => {
  it('navigates to the chosen option’s link', async () => {
    render(
      <LinkSelect
        label="Rows per page"
        value="10"
        options={[
          { value: '10', label: '10', href: '/' },
          { value: '25', label: '25', href: '/?size=25' },
        ]}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Rows per page' });
    await userEvent.selectOptions(select, '25');
    expect(router.push).toHaveBeenCalledWith('/?size=25', { scroll: false });
    // A value no option offers (tampered DOM) does nothing.
    fireEvent.change(select, { target: { value: '999' } });
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
