import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveDraft } from '@/app/(portal)/requests/actions';
import { createTranslator } from '@/i18n/translator';
import { saveMessages, tableLabels } from '@/lib/request-view';
import { AddEmployeeForm } from './add-employee-form';
import { ProposalsTable, type ProposalRowView } from './proposals-table';

vi.mock('@/app/(portal)/requests/actions', () => ({
  saveDraft: vi.fn(),
  removeEmployeeAction: vi.fn(),
}));

const t = createTranslator('en');
const LINE = '22222222-2222-4222-8222-222222222221';

const row: ProposalRowView = {
  lineId: LINE,
  fullName: 'Omar Haddad',
  employeeNumber: 'EMP-3318',
  grade: 'G7',
  currencyCode: 'AED',
  current: 'AED 21,500',
  newSalary: 'AED 23,220',
  kind: 'percent',
  value: '8',
  labels: {
    proposedAs: 'Proposed as, for Omar Haddad',
    value: 'Proposed increase for Omar Haddad',
    remove: 'Remove Omar Haddad',
  },
};

function table(editable = true) {
  return render(
    <ProposalsTable
      formId="proposals-form"
      requestId="11111111-1111-4111-8111-111111111111"
      version={3}
      editable={editable}
      rows={[
        row,
        {
          ...row,
          lineId: 'line-2',
          fullName: 'Neha Iyer',
          kind: 'amount',
          value: '',
          labels: {
            remove: 'Remove Neha Iyer',
            value: 'Proposed increase for Neha Iyer',
            proposedAs: 'Proposed as, for Neha Iyer',
          },
        },
      ]}
      labels={tableLabels(t)}
      messages={saveMessages(t)}
      footer={<p>Totals</p>}
    />,
  );
}

beforeEach(() => {
  vi.mocked(saveDraft).mockResolvedValue({ rows: [] });
});

describe('ProposalsTable', () => {
  it('renders an editable row per employee, labelled for screen readers', () => {
    table();
    expect(
      screen.getByRole('table', {
        name: 'Employees in this request and their proposed increments',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Proposed increase for Omar Haddad' })).toHaveValue(
      '8',
    );
    const choice = screen.getByRole('group', { name: 'Proposed as, for Omar Haddad' });
    expect(within(choice).getByRole('radio', { name: '%' })).toBeChecked();
    expect(
      within(screen.getByRole('group', { name: 'Proposed as, for Neha Iyer' })).getByRole('radio', {
        name: 'AED',
      }),
    ).toBeChecked();
    expect(screen.getByRole('button', { name: 'Remove Omar Haddad' })).toHaveAttribute(
      'value',
      LINE,
    );
    expect(screen.getByText('Totals')).toBeInTheDocument();
  });

  it('makes "Save draft" the default button, so Enter never removes an employee', () => {
    const { container } = table();
    const first = container.querySelector('form button[type="submit"]');
    expect(first).toHaveTextContent('Save draft');
  });

  it('shows the refusal and the row’s problem, keeping what was typed', async () => {
    vi.mocked(saveDraft).mockResolvedValue({
      error: 'request.errors.rowsInvalid',
      rows: [
        { lineId: LINE, kind: 'amount', value: '99999', error: 'request.errors.overLimit' },
        { lineId: 'line-2', kind: 'percent', value: '7.5' },
      ],
    });
    table();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Proposed increase for Omar Haddad' }),
      '{Enter}',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Some proposals need a fix');
    const input = screen.getByRole('textbox', { name: 'Proposed increase for Omar Haddad' });
    expect(input).toHaveValue('99999');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/at most 100%/u);
    // A valid row keeps its typed value too, without an error.
    const other = screen.getByRole('textbox', { name: 'Proposed increase for Neha Iyer' });
    expect(other).toHaveValue('7.5');
    expect(other).toHaveAttribute('aria-invalid', 'false');
    expect(
      within(screen.getByRole('group', { name: 'Proposed as, for Omar Haddad' })).getByRole(
        'radio',
        { name: 'AED' },
      ),
    ).toBeChecked();
  });

  it('falls back to the key for an unknown message', async () => {
    vi.mocked(saveDraft).mockResolvedValue({
      error: 'request.errors.generic',
      rows: [{ lineId: LINE, kind: 'percent', value: 'x', error: 'unknown.key' as never }],
    });
    table();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Proposed increase for Omar Haddad' }),
      '{Enter}',
    );
    expect(await screen.findByText('unknown.key')).toBeInTheDocument();
  });

  it('renders read-only for people who cannot edit', () => {
    table(false);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByText('%')).toHaveLength(1);
    expect(screen.getByText('AED', { selector: 'span' })).toBeInTheDocument();
  });
});

describe('AddEmployeeForm', () => {
  it('posts the chosen employee with the hidden fields', () => {
    const { container } = render(
      <AddEmployeeForm
        action={vi.fn()}
        hidden={{ requestId: 'r-1' }}
        employees={[
          { id: 'e-1', employeeNumber: 'EMP-1101', fullName: 'Aisha Rahman', grade: 'G5' },
        ]}
        t={t}
      >
        <span>extra</span>
      </AddEmployeeForm>,
    );
    const select = screen.getByRole('combobox', { name: 'Add employee' });
    expect(select).toBeRequired();
    expect(screen.getByRole('option', { name: 'Aisha Rahman · EMP-1101 · G5' })).toHaveValue('e-1');
    expect(container.querySelector('input[name="requestId"]')).toHaveValue('r-1');
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('type', 'submit');
    expect(screen.getByText('extra')).toBeInTheDocument();
  });
});
