import { act, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Dialog, DIALOG_EXIT_MS, type DialogProps } from './dialog.js';

// jsdom has <dialog> but not its modal methods.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  vi.useRealTimers();
});

type HarnessProps = Partial<Pick<DialogProps, 'dismissible' | 'role'>> & { withBody?: boolean };

function Harness({ withBody = true, ...props }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      <Dialog
        {...props}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Submit INC-2026-0001?"
        actions={
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </button>
        }
      >
        {withBody ? 'You can’t edit it afterwards.' : undefined}
      </Dialog>
    </>
  );
}

/** Lets the exit animation finish. */
async function afterExit() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DIALOG_EXIT_MS + 20));
  });
}

const dialogElement = () => document.querySelector('dialog');

describe('Dialog', () => {
  it('opens as a labelled, described modal with focus on its panel (no ring on a button)', async () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit INC-2026-0001?' });
    expect(dialog).toHaveAccessibleDescription('You can’t edit it afterwards.');
    expect(dialog).toHaveAttribute('data-state', 'open');
    // Focus sits on the panel; Tab then reaches the actions.
    expect(document.activeElement).toBe(screen.getByTestId('dialog-panel'));
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('animates out before closing, and closes from its actions', async () => {
    render(<Harness withBody={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).not.toHaveAccessibleDescription();
    // The page behind doesn't scroll while it is open.
    expect(document.documentElement.style.overflow).toBe('hidden');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // Still in the top layer while it fades out…
    expect(dialogElement()).toHaveAttribute('open');
    expect(dialogElement()).toHaveAttribute('data-state', 'closed');
    // …then really closed.
    await afterExit();
    expect(dialogElement()).not.toHaveAttribute('open');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('gives scrolling back when the page goes away with the dialog open', async () => {
    const { unmount } = render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(document.documentElement.style.overflow).toBe('hidden');
    unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('stays open when reopened during its exit', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(dialogElement()).toHaveAttribute('data-state', 'closed');
    fireEvent.click(screen.getByRole('button', { name: 'Open', hidden: true }));
    await afterExit();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'open');
  });

  it('closes on Esc and on the backdrop, not on a click inside', async () => {
    render(<Harness role="alertdialog" />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('alertdialog'), cancel);
    // The browser's own close is always prevented: the parent owns `open`.
    expect(cancel.defaultPrevented).toBe(true);
    await afterExit();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('heading', { name: 'Submit INC-2026-0001?' }));
    expect(screen.getByRole('alertdialog')).toHaveAttribute('data-state', 'open');
    await userEvent.click(screen.getByTestId('dialog-backdrop'));
    await afterExit();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('ignores Esc and the backdrop while it is not dismissible (e.g. submitting)', async () => {
    render(<Harness dismissible={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), cancel);
    expect(cancel.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByTestId('dialog-backdrop'));
    await afterExit();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'open');
  });
});
