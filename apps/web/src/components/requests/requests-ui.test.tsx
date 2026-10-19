import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveDraft } from '@/app/(portal)/requests/actions';
import { createTranslator } from '@/i18n/translator';
import { saveMessages, tableLabels } from '@/lib/request-view';
import { AddEmployeeForm } from './add-employee-form';
import { DraftForm } from './draft-form';
import { ProposalsTable, type ProposalRowView } from './proposals-table';

vi.mock('@/app/(portal)/requests/actions', () => ({
  saveDraft: vi.fn(),
  removeEmployeeAction: vi.fn(),
  uploadEvidenceAction: vi.fn(),
  removeEvidenceAction: vi.fn(),
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
  criteria: [
    { code: 'C1', state: 'pending' },
    { code: 'C2', state: 'pending' },
  ],
  criteriaLabel: '0/2 complete',
  kind: 'percent',
  value: '8',
  locked: false,
  lockedLabel: 'With Sirius HR',
  labels: {
    proposedAs: 'Proposed as, for Omar Haddad',
    value: 'Proposed increase for Omar Haddad',
    remove: 'Remove Omar Haddad',
    assess: 'Assess criteria for Omar Haddad',
  },
};

function table(editable = true) {
  return render(
    <DraftForm
      formId="draft-form"
      requestId="11111111-1111-4111-8111-111111111111"
      version={3}
      employee={LINE}
      editable={editable}
      saveLabel="Save draft"
    >
      <ProposalsTable
        editable={editable}
        selectedLineId={LINE}
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
              assess: 'Assess criteria for Neha Iyer',
            },
          },
        ]}
        labels={tableLabels(t)}
        messages={saveMessages(t)}
        totals={[
          { id: 'total-employees', label: 'Employees', value: '2' },
          { id: 'total-increase', label: 'Total increase', value: 'AED 1,718 / month' },
        ]}
      />
    </DraftForm>,
  );
}

beforeEach(() => {
  vi.mocked(saveDraft).mockResolvedValue({ rows: [] });
});

describe('ProposalsTable', () => {
  it('shows the totals as data it renders itself (no server markup in a client list)', () => {
    table();
    const totals = screen.getAllByRole('term')[0]?.closest('dl');
    expect(totals).toHaveTextContent('Employees2Total increaseAED 1,718 / month');
    expect(screen.getByTestId('total-increase')).toHaveTextContent('AED 1,718 / month');
  });

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
    // No name/value on the button: React overrides them; the line ID is bound to the action.
    expect(screen.getByRole('button', { name: 'Remove Omar Haddad' })).not.toHaveAttribute('value');
    expect(screen.getByTestId('total-employees')).toHaveTextContent('2');
  });

  it('makes "Save draft" the default button, so Enter never removes an employee', () => {
    const { container } = table();
    const first = container.querySelector('form button[type="submit"]');
    expect(first).toHaveTextContent('Save draft');
  });

  it('joins every field to the draft form and posts the whole table', () => {
    const { container } = table();
    const form = container.querySelector<HTMLFormElement>('form#draft-form');
    if (form === null) throw new Error('no form');
    const data = new FormData(form);
    expect(data.get('requestId')).toBe('11111111-1111-4111-8111-111111111111');
    expect(data.get('employee')).toBe(LINE);
    expect(data.getAll('lineId')).toEqual([LINE, 'line-2']);
    expect(data.get(`value:${LINE}`)).toBe('8');
    expect(data.get(`kind:${LINE}`)).toBe('percent');
  });

  it('marks the employee being assessed, whose pencil saves and opens their criteria', () => {
    table();
    const pencil = screen.getByRole('button', { name: 'Assess criteria for Omar Haddad' });
    expect(pencil).toHaveAttribute('aria-current', 'true');
    expect(pencil).toHaveAttribute('name', 'selectLine');
    expect(pencil).toHaveAttribute('value', LINE);
    expect(pencil).toHaveAttribute('form', 'draft-form');
    expect(
      screen.getByRole('button', { name: 'Assess criteria for Neha Iyer' }),
    ).not.toHaveAttribute('aria-current');
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
    expect(screen.queryByRole('button', { hidden: true })).not.toBeInTheDocument();
    expect(screen.getAllByText('%')).toHaveLength(1);
    expect(screen.getByText('AED', { selector: 'span' })).toBeInTheDocument();
  });
});

describe('ProposalsTable while fixing returned employees [R1-08]', () => {
  it('posts only the returned rows; the others show who has them, and nothing can be removed', () => {
    const { container } = render(
      <DraftForm
        formId="draft-form"
        requestId="11111111-1111-4111-8111-111111111111"
        version={6}
        editable
        saveLabel="Save draft"
      >
        <ProposalsTable
          editable
          removable={false}
          rows={[
            row,
            {
              ...row,
              lineId: 'line-2',
              fullName: 'Neha Iyer',
              locked: true,
              labels: { ...row.labels, assess: 'Assess criteria for Neha Iyer' },
            },
          ]}
          labels={tableLabels(t)}
          messages={saveMessages(t)}
          totals={[]}
        />
      </DraftForm>,
    );
    const form = container.querySelector<HTMLFormElement>('form#draft-form');
    expect(new FormData(form ?? undefined).getAll('lineId')).toEqual([LINE]);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByText('With Sirius HR')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/u })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assess criteria for Neha Iyer' })).toBeNull();
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
