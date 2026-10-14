import { Badge, Button } from '@peopleforge/ui';

export interface ReadyItemView {
  lineId: string;
  fullName: string;
  ready: boolean;
  /** "Ready", or "Still needed: a proposed increment · 3 criteria". */
  status: string;
}

export interface ReadyPanelProps {
  summary: string;
  items: readonly ReadyItemView[];
  note: string;
  submitLabel: string;
  /** Why the button can't be used yet. */
  caption: string;
}

/**
 * Figma "3. Ready to submit?": who is ready and what is missing (R1-03, R1-04, R1-06).
 * Submitting arrives with S4; until then the button stays disabled and the caption says why.
 */
export function ReadyPanel({ summary, items, note, submitLabel, caption }: ReadyPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-ink" data-testid="ready-summary">
        {summary}
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
        {items.map((item) => (
          <li
            key={item.lineId}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <span className="text-sm font-medium text-ink">{item.fullName}</span>
            {item.ready ? (
              <Badge tone="success" icon="check">
                {item.status}
              </Badge>
            ) : (
              <span className="text-xs text-warning-700">{item.status}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="rounded-card bg-surface-muted p-4 text-sm text-ink-muted">{note}</p>
      <div className="flex flex-col items-end gap-1">
        <Button disabled aria-describedby="submit-caption">
          {submitLabel}
        </Button>
        <p id="submit-caption" className="text-xs text-ink-subtle">
          {caption}
        </p>
      </div>
    </div>
  );
}
