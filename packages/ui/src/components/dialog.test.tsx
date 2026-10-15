import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Dialog } from './dialog.js';

// jsdom has <dialog> but not its modal methods.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

function Harness({ withBody = true }: { withBody?: boolean }) {
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

describe('Dialog', () => {
  it('opens as a labelled modal and closes from its actions', async () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit INC-2026-0001?' });
    expect(dialog).toHaveTextContent('You can’t edit it afterwards.');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Esc and on the backdrop, not on a click inside', async () => {
    render(<Harness withBody={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('heading', { name: 'Submit INC-2026-0001?' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
