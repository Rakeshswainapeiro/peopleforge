import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RequestLine } from '@peopleforge/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decideAction } from '@/app/(portal)/review/actions';
import { createTranslator } from '@/i18n/translator';
import { markStateLabels, saveMessages } from '@/lib/request-view';
import { decisionPanelLabels, queueRows, reasonOptions } from '@/lib/review-view';
import {
  LINE_1,
  must,
  queueItem,
  queuePage,
  REQUEST_ID,
  submittedRequest,
  VERIFIED,
} from '@/test-support/requests';
import { DecisionPanel } from './decision-panel';
import { ReviewQueueTable } from './review-queue-table';
import { VerifyToggle } from './verify-toggle';

vi.mock('@/app/(portal)/review/actions', () => ({ decideAction: vi.fn() }));

const t = createTranslator('en');
const omar = must(submittedRequest().lines[0]);
const verifiedOmar = {
  ...omar,
  criteria: omar.criteria.map((criterion) => ({ ...criterion, verification: VERIFIED })),
};

function panel(line: RequestLine = verifiedOmar) {
  return render(
    <DecisionPanel
      requestId={REQUEST_ID}
      lineId={LINE_1}
      decisionKey="decision-key-1"
      reasons={reasonOptions(t)}
      maxComment={2000}
      labels={decisionPanelLabels(line, 'en', t)}
      messages={saveMessages(t)}
    />,
  );
}

const posted = () => vi.mocked(decideAction).mock.calls.at(-1)?.[1];

beforeEach(() => {
  vi.mocked(decideAction).mockResolvedValue({});
});

describe('DecisionPanel [R1-08, R1-09]', () => {
  it('approves as proposed with one click once every criterion is verified', async () => {
    panel();
    const tabs = screen.getByRole('tablist', { name: 'Decision' });
    expect(within(tabs).getByRole('tab', { name: 'Approve' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('combobox', { name: /Reason/u })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Approve Omar Haddad' }));
    await waitFor(() => {
      expect(decideAction).toHaveBeenCalled();
    });
    expect(posted()?.get('decision')).toBe('approved');
    expect(posted()?.get('decisionKey')).toBe('decision-key-1');
    expect(posted()?.get('lineId')).toBe(LINE_1);
  });

  it('keeps Approve disabled while criteria are unverified, saying how many', () => {
    panel(omar);
    expect(screen.getByText('Verify 5 more criteria before approving.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve Omar Haddad' })).toBeDisabled();
  });

  it('asks for a percentage, a reason and a comment to approve a different increment', async () => {
    panel();
    const change = screen.getByRole('checkbox', { name: 'Approve a different increment' });
    await userEvent.click(change);
    await userEvent.click(change);
    expect(screen.queryByRole('textbox', { name: /Approved increment/u })).toBeNull();
    await userEvent.click(change);
    const percent = screen.getByRole('textbox', { name: /Approved increment/u });
    expect(percent).toHaveAccessibleDescription('Proposed: 8%');
    await userEvent.type(percent, '4.5');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Reason/u }), 'budget');
    await userEvent.type(screen.getByRole('textbox', { name: /Comment/u }), 'Budget band.');
    await userEvent.click(screen.getByRole('button', { name: 'Approve Omar Haddad' }));
    await waitFor(() => {
      expect(posted()?.get('approvedPercent')).toBe('4.5');
    });
    expect(posted()?.get('change')).toBe('on');
    expect(posted()?.get('reasonCode')).toBe('budget');
  });

  it('rejects or returns with that decision’s reasons, by click or arrow keys', async () => {
    panel(omar);
    await userEvent.click(screen.getByRole('tab', { name: 'Reject' }));
    expect(screen.getByText(/Rejects the increment/u)).toBeInTheDocument();
    // Approve's verification rule doesn't hold back a rejection.
    expect(screen.getByRole('button', { name: 'Reject Omar Haddad' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Criteria not met' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    const returnTab = screen.getByRole('tab', { name: 'Return' });
    expect(returnTab).toHaveAttribute('aria-selected', 'true');
    expect(returnTab).toHaveFocus();
    expect(screen.getByRole('option', { name: 'Unclear justification' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Reason/u }), 'other');
    await userEvent.type(screen.getByRole('textbox', { name: /Comment/u }), 'Why 9%?');
    await userEvent.click(screen.getByRole('button', { name: 'Return Omar Haddad' }));
    await waitFor(() => {
      expect(posted()?.get('decision')).toBe('returned');
    });
    // Wraps round; other keys do nothing.
    await userEvent.click(returnTab);
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Approve' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Return' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Return' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves the other way in right-to-left layouts', async () => {
    document.documentElement.dir = 'rtl';
    try {
      panel();
      await userEvent.click(screen.getByRole('tab', { name: 'Approve' }));
      await userEvent.keyboard('{ArrowLeft}');
      expect(screen.getByRole('tab', { name: 'Reject' })).toHaveAttribute('aria-selected', 'true');
    } finally {
      document.documentElement.dir = '';
    }
  });

  it('shows the refusal and keeps what was typed on the chosen tab', async () => {
    vi.mocked(decideAction).mockResolvedValue({
      attempt: 1,
      error: 'request.errors.decisionInvalid',
      values: {
        decision: 'rejected',
        change: '',
        approvedPercent: '',
        reasonCode: 'budget',
        comment: 'Over budget.',
      },
    });
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Approve Omar Haddad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a reason and write a comment.',
    );
    // Back on the tab that was chosen, with its reason and comment.
    expect(screen.getByRole('tab', { name: 'Reject' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox', { name: /Reason/u })).toHaveValue('budget');
    expect(screen.getByRole('textbox', { name: /Comment/u })).toHaveValue('Over budget.');
  });

  it('falls back to the key for an unknown message, and restores a typed change', async () => {
    vi.mocked(decideAction).mockResolvedValue({
      attempt: 1,
      error: 'unknown.key' as never,
      values: {
        decision: 'approved',
        change: 'on',
        approvedPercent: '150',
        reasonCode: 'budget',
        comment: 'x',
      },
    });
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Approve Omar Haddad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('unknown.key');
    expect(screen.getByRole('checkbox', { name: 'Approve a different increment' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: /Approved increment/u })).toHaveValue('150');
  });
});

describe('VerifyToggle [R1-07]', () => {
  it('posts its bound action, named for the criterion and employee', async () => {
    const action = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <VerifyToggle
        action={action}
        verified={false}
        text="Mark verified"
        label="Mark C1 verified for Omar Haddad"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark C1 verified for Omar Haddad' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledOnce();
    });
    rerender(<VerifyToggle action={action} verified text="Undo" label="Undo the check of C1" />);
    expect(screen.getByRole('button', { name: 'Undo the check of C1' })).toHaveTextContent('Undo');
  });
});

describe('ReviewQueueTable [R1-07]', () => {
  it('lists employees with their request, marks, verification and waiting time', () => {
    const now = new Date('2026-10-17T08:00:00Z');
    render(
      <ReviewQueueTable
        rows={queueRows(
          queuePage([
            queueItem(),
            queueItem({ lineId: 'x', overdue: false, reviewStatus: 'approved' }),
          ]),
          now,
          'en',
          t,
        )}
        labels={{
          caption: 'Employees in the review queue',
          employee: 'Employee',
          request: 'Request',
          proposed: 'Proposed',
          submitted: 'Submitted results',
          verified: 'Verified',
          waiting: 'Waiting',
          status: 'Status',
          action: 'Action',
          stateLabels: markStateLabels(t),
        }}
      />,
    );
    const table = screen.getByRole('table', { name: 'Employees in the review queue' });
    const [, overdue, viewed] = within(table).getAllByRole('row');
    expect(overdue).toHaveTextContent('Omar Haddad');
    expect(overdue).toHaveTextContent('INC-2026-0152');
    expect(overdue).toHaveTextContent('SUB-A · Criterion 2 of 5');
    expect(overdue).toHaveTextContent('2 of 5');
    expect(overdue).toHaveTextContent('Past 2-day reminder');
    expect(within(must(overdue)).getByRole('link', { name: 'Review Omar Haddad' })).toHaveAttribute(
      'href',
      `/requests/${REQUEST_ID}/employees/${LINE_1}`,
    );
    expect(
      within(must(viewed)).getByRole('link', { name: 'View Omar Haddad' }),
    ).toBeInTheDocument();
    expect(viewed).not.toHaveTextContent('Past');
  });
});
