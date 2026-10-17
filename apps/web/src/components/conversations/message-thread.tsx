import { cn } from '@peopleforge/ui';
import type { MessageView } from '@/lib/conversation-view';

/**
 * An employee's questions and answers, oldest first (R1-08): the reader's own side at the end in
 * brand colours, the other side at the start. Text and author, never colour alone.
 */
export function MessageThread({
  messages,
  label,
  empty,
}: {
  messages: readonly MessageView[];
  label: string;
  empty: string;
}) {
  if (messages.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ol aria-label={label} className="flex flex-col gap-3">
      {messages.map((message) => (
        <li
          key={message.id}
          data-mine={message.mine}
          className={cn('flex flex-col gap-1', message.mine ? 'items-end' : 'items-start')}
        >
          <p className="text-xs text-ink-muted">
            <span className="font-semibold text-ink">{message.by}</span> · {message.at}
          </p>
          <p
            className={cn(
              'max-w-prose rounded-card px-4 py-2.5 text-sm whitespace-pre-line',
              message.mine
                ? 'bg-brand-600 text-white'
                : 'border border-line-strong bg-surface-muted text-ink',
            )}
          >
            {message.body}
          </p>
        </li>
      ))}
    </ol>
  );
}
