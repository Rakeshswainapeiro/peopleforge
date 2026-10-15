import { StatusMark } from '@peopleforge/ui';
import { SubmitControl, type SubmitControlLabels, type SubmitDialogView } from './submit-control';

export interface ReadyItemView {
  lineId: string;
  fullName: string;
  ready: boolean;
  /** "All 5 criteria complete", or "2 criteria incomplete · no proposed increment". */
  status: string;
}

export interface ReadyPanelProps {
  items: readonly ReadyItemView[];
  /** "3 of 4 employees still have incomplete criteria. Submit unlocks when every employee is 5/5." */
  note: string;
  canSubmit: boolean;
  submitKey: string;
  submitLabels: SubmitControlLabels;
  submitDialog: SubmitDialogView;
  /** What submitting does (Figma caption). */
  caption: string;
}

/**
 * Figma "3. Ready to submit?": a row per employee (✓ ready, ! not yet), the grey note and the
 * full-width submit button with its confirmation (R1-03, R1-04, R1-06, R1-07).
 */
export function ReadyPanel({
  items,
  note,
  canSubmit,
  submitKey,
  submitLabels,
  submitDialog,
  caption,
}: ReadyPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li
            key={item.lineId}
            data-ready={item.ready}
            className="flex items-start gap-3 rounded-card border border-line-strong px-5 py-3"
          >
            <StatusMark size="md" state={item.ready ? 'pass' : 'warning'} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{item.fullName}</p>
              <p className="text-xs text-ink">{item.status}</p>
            </div>
          </li>
        ))}
      </ul>
      <p
        className="mt-3 rounded-card bg-surface-muted px-4 py-3 text-xs text-ink"
        data-testid="ready-note"
      >
        {note}
      </p>
      <SubmitControl
        canSubmit={canSubmit}
        submitKey={submitKey}
        describedBy="submit-caption"
        labels={submitLabels}
        dialog={submitDialog}
      />
      <p id="submit-caption" className="text-xs text-ink">
        {caption}
      </p>
    </div>
  );
}
