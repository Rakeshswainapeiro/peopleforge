import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postMessageAction } from '@/app/(portal)/conversations/actions';
import { createTranslator } from '@/i18n/translator';
import { messageViews } from '@/lib/conversation-view';
import { saveMessages } from '@/lib/request-view';
import { LINE_1, REQUEST_ID, threadMessages } from '@/test-support/requests';
import { MessageForm } from './message-form';
import { MessageThread } from './message-thread';

vi.mock('@/app/(portal)/conversations/actions', () => ({ postMessageAction: vi.fn() }));

const t = createTranslator('en');

function messageForm() {
  return render(
    <MessageForm
      requestId={REQUEST_ID}
      lineId={LINE_1}
      messageKey="message-key-1"
      maxLength={2000}
      labels={{
        message: 'Message',
        placeholder: 'Answer Sirius HR',
        send: 'Send',
        sending: 'Sending…',
        sent: 'Sent.',
      }}
      messages={saveMessages(t)}
    />,
  );
}

beforeEach(() => {
  vi.mocked(postMessageAction).mockResolvedValue({ attempt: 1 });
});

describe('MessageThread [R1-08]', () => {
  it('lists messages oldest first, the reader’s own at the end', () => {
    render(
      <MessageThread
        messages={messageViews(threadMessages(), 'subsidiary', 'SUB-A', 'en', t)}
        label="Messages about Omar Haddad"
        empty="No questions yet."
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-mine', 'false');
    expect(items[0]).toHaveTextContent('Sirius HR · Sara Al Mansoori');
    expect(items[1]).toHaveAttribute('data-mine', 'true');
    expect(items[1]).toHaveClass('items-end');
  });

  it('says when nobody has asked yet', () => {
    render(<MessageThread messages={[]} label="Messages" empty="No questions yet." />);
    expect(screen.getByText('No questions yet.')).toBeInTheDocument();
  });
});

describe('MessageForm [R1-08]', () => {
  it('sends the message with a key per attempt, then starts empty and says Sent', async () => {
    messageForm();
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Yes, attached.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(postMessageAction).toHaveBeenCalled();
    });
    const sent = vi.mocked(postMessageAction).mock.calls[0]?.[1];
    expect(sent?.get('body')).toBe('Yes, attached.');
    expect(sent?.get('messageKey')).toBe('message-key-1-0');
    expect(await screen.findByText('Sent.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });

  it('keeps the text and shows why when refused', async () => {
    vi.mocked(postMessageAction).mockResolvedValue({
      attempt: 1,
      error: 'request.errors.messageInvalid',
      body: 'x',
    });
    messageForm();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Write a message of up to 2,000 characters.',
    );
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('x');
    expect(screen.queryByText('Sent.')).toBeNull();
  });

  it('falls back to the key for an unknown message', async () => {
    vi.mocked(postMessageAction).mockResolvedValue({ attempt: 1, error: 'unknown.key' as never });
    messageForm();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('unknown.key');
  });
});
