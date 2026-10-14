import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Field, Input, Select, Textarea } from './form.js';
import { NavItem } from './nav-item.js';
import { Pagination } from './pagination.js';
import { CellStack, Table, TBody, Td, Th, THead, Tr } from './table.js';
import { SegmentedChoice } from './segmented-choice.js';
import { ToggleGroup } from './toggle-group.js';

describe('Field', () => {
  it('labels the control and links hint and error to it', () => {
    render(
      <Field label="Justification" required hint="Why does this employee pass?" error="Required">
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} required />
        )}
      </Field>,
    );
    const box = screen.getByRole('textbox', { name: 'Justification' });
    expect(box).toHaveAccessibleDescription('Why does this employee pass? Required');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAttribute('rows', '3');
  });

  it('works without hint or error, and can hide its label visually', () => {
    render(
      <Field label="Search" hideLabel className="x">
        {({ id, describedBy, invalid }) => (
          <Input id={id} icon="search" aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Search' });
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).toHaveClass('ps-9');
    expect(screen.getByText('Search')).toHaveClass('sr-only');
  });

  it('offers a large size for table value boxes', () => {
    render(
      <>
        <Input aria-label="Big" controlSize="lg" />
        <Input aria-label="Big search" controlSize="lg" icon="search" />
        <Select aria-label="Big select" controlSize="lg">
          <option>One</option>
        </Select>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Big' })).toHaveClass('h-12', 'text-base');
    expect(screen.getByRole('textbox', { name: 'Big search' })).toHaveClass('h-12');
    expect(screen.getByRole('combobox', { name: 'Big select' })).toHaveClass('h-12');
  });

  it('renders a plain input and a select with a chevron', async () => {
    render(
      <>
        <Input aria-label="Value" defaultValue="6%" />
        <Select aria-label="Period" defaultValue="q3">
          <option value="q2">Q2 2026</option>
          <option value="q3">Q3 2026</option>
        </Select>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveClass('px-3', 'h-10');
    const select = screen.getByRole('combobox', { name: 'Period' });
    await userEvent.selectOptions(select, 'q2');
    expect(select).toHaveValue('q2');
    expect(select.parentElement?.querySelector('[data-icon="chevron-down"]')).not.toBeNull();
  });
});

describe('ToggleGroup', () => {
  const items = [
    { href: '?view=request', label: 'By request', count: 7, active: true },
    { href: '?view=employee', label: 'By employee', count: 29, active: false },
  ];

  it('renders segmented view links with counts and marks the current one', () => {
    render(<ToggleGroup label="View" items={items} />);
    const current = screen.getByRole('link', { name: 'By request 7' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveClass('bg-ink');
    expect(screen.getByRole('link', { name: 'By employee 29' })).toHaveClass(
      'hover:bg-surface-muted',
    );
    expect(screen.getByRole('navigation', { name: 'View' }).querySelector('ul')).toHaveClass(
      'p-0.5',
    );
  });

  it('renders filter pills', () => {
    render(
      <ToggleGroup
        label="Filter"
        variant="pills"
        items={[
          { href: '?f=all', label: 'All', active: false },
          { href: '?f=unread', label: 'Unread', active: true },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'All' })).toHaveClass(
      'rounded-full',
      'hover:border-ink-subtle',
    );
    expect(screen.getByRole('link', { name: 'Unread' })).toHaveClass('bg-ink');
  });
});

describe('Table', () => {
  it('renders a captioned table with hoverable and selectable rows', () => {
    render(
      <Table caption="Increment requests" className="x">
        <THead>
          <Tr>
            <Th>Request</Th>
          </Tr>
        </THead>
        <TBody>
          <Tr selected>
            <Td>
              <CellStack primary="Omar Haddad" secondary="EMP-3318 · G7" />
            </Td>
          </Tr>
          <Tr>
            <Td className="y">
              <CellStack primary="Neha Iyer" />
            </Td>
          </Tr>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole('table', { name: 'Increment requests' })).toHaveClass('x');
    expect(screen.getByRole('columnheader', { name: 'Request' })).toHaveAttribute('scope', 'col');
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[2]).not.toHaveAttribute('aria-selected');
    expect(screen.getByText('EMP-3318 · G7')).toBeInTheDocument();
    expect(screen.getByText('Neha Iyer').closest('td')).toHaveClass('y');
  });
});

describe('Pagination', () => {
  const labels = {
    navigation: 'Pagination',
    pageOf: 'Page 2 of 4',
    first: 'First page',
    previous: 'Previous page',
    next: 'Next page',
    last: 'Last page',
  };
  const hrefFor = (page: number) => `?page=${String(page)}`;

  it('links to first, previous, next and last pages', () => {
    render(
      <Pagination
        page={2}
        pageCount={4}
        hrefFor={hrefFor}
        labels={labels}
        pageSize={<span>Rows</span>}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent(
      'RowsPage 2 of 4',
    );
    expect(screen.getByRole('link', { name: 'First page' })).toHaveAttribute('href', '?page=1');
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '?page=1');
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '?page=3');
    expect(screen.getByRole('link', { name: 'Last page' })).toHaveAttribute('href', '?page=4');
  });

  it('disables links past the ends and clamps out-of-range pages', () => {
    render(<Pagination page={9} pageCount={0} hrefFor={hrefFor} labels={labels} />);
    for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).not.toHaveAttribute('href');
    }
  });
});

describe('NavItem', () => {
  it('marks the current page as a white pill', () => {
    render(
      <>
        <NavItem href="/" label="Home" icon="home" active />
        <NavItem href="/reports" label="Reports" icon="chart" active={false} />
      </>,
    );
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(home).toHaveClass('bg-white');
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveClass('hover:bg-white/10');
  });
});

describe('SegmentedChoice', () => {
  it('is a labelled radio group posting the chosen value', async () => {
    render(
      <form aria-label="f">
        <SegmentedChoice
          name="kind"
          legend="Proposed as"
          defaultValue="percent"
          options={[
            { value: 'percent', label: '%' },
            { value: 'amount', label: 'AED' },
          ]}
        />
      </form>,
    );
    const group = screen.getByRole('group', { name: 'Proposed as' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '%' })).toBeChecked();
    await userEvent.click(screen.getByText('AED'));
    expect(screen.getByRole('radio', { name: 'AED' })).toBeChecked();
    const form = screen.getByRole<HTMLFormElement>('form', { name: 'f' });
    expect(new FormData(form).get('kind')).toBe('amount');
  });

  it('can be medium sized and start with nothing chosen', () => {
    render(
      <SegmentedChoice name="k" legend="L" size="md" options={[{ value: 'a', label: 'A' }]} />,
    );
    expect(screen.getByRole('radio', { name: 'A' })).not.toBeChecked();
    expect(screen.getByText('A')).toHaveClass('h-9');
  });
});
