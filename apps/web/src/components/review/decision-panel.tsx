'use client';

import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  cn,
  focusRing,
  transition,
} from '@peopleforge/ui';
import { useActionState, useId, useState, type KeyboardEvent } from 'react';
import { decideAction, type DecisionFormState } from '@/app/(portal)/review/actions';

export type DecisionTab = 'approved' | 'rejected' | 'returned';

const TABS: readonly DecisionTab[] = ['approved', 'rejected', 'returned'];
/** The tab after and before each, wrapping round (arrow keys). */
const NEXT: Readonly<Record<DecisionTab, DecisionTab>> = {
  approved: 'rejected',
  rejected: 'returned',
  returned: 'approved',
};
const PREVIOUS: Readonly<Record<DecisionTab, DecisionTab>> = {
  approved: 'returned',
  rejected: 'approved',
  returned: 'rejected',
};

export interface ReasonOption {
  value: string;
  label: string;
}

export interface DecisionPanelLabels {
  tabs: string;
  tab: Readonly<Record<DecisionTab, string>>;
  hint: Readonly<Record<DecisionTab, string>>;
  confirm: Readonly<Record<DecisionTab, string>>;
  deciding: string;
  changeIncrement: string;
  approvedPercent: string;
  approvedPercentHint: string;
  reason: string;
  reasonPlaceholder: string;
  comment: string;
  commentRequired: string;
  commentPlaceholder: Readonly<Record<DecisionTab, string>>;
  /** "Verify 2 more criteria before approving."; null when every criterion is verified. */
  verifyFirst: string | null;
}

export interface DecisionPanelProps {
  requestId: string;
  lineId: string;
  /** Idempotency key for this page view: a double click can't decide twice. */
  decisionKey: string;
  /** Reasons per decision; approving at another percentage uses the "approved" list. */
  reasons: Readonly<Record<DecisionTab, readonly ReasonOption[]>>;
  maxComment: number;
  labels: DecisionPanelLabels;
  /** Translated texts for the error keys the decision can return, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
}

const INITIAL: DecisionFormState = {};

/** The value for a tab, without indexing by a variable key. */
function forTab<T>(values: Readonly<Record<DecisionTab, T>>, tab: DecisionTab): T {
  switch (tab) {
    case 'approved':
      return values.approved;
    case 'rejected':
      return values.rejected;
    case 'returned':
      return values.returned;
  }
}

/**
 * Figma "Review employee" decision panel (R1-08, R1-09): Approve, Reject or Return in tabs.
 * Approving as proposed needs nothing more; approving another percentage, rejecting and
 * returning need a reason and a comment, which the subsidiary sees. Approve stays disabled
 * until every criterion is verified (the API refuses it anyway).
 */
export function DecisionPanel(props: DecisionPanelProps) {
  const [state, formAction, pending] = useActionState(decideAction, INITIAL);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="requestId" value={props.requestId} />
      <input type="hidden" name="lineId" value={props.lineId} />
      <input type="hidden" name="decisionKey" value={props.decisionKey} />
      {/* Afresh after each refusal, from what was typed (React resets a form after its action). */}
      <DecisionFields key={state.attempt ?? 0} {...props} state={state} pending={pending} />
    </form>
  );
}

function DecisionFields({
  reasons,
  maxComment,
  labels,
  messages,
  state,
  pending,
}: DecisionPanelProps & { state: DecisionFormState; pending: boolean }) {
  const typed = state.values ?? {};
  const [tab, setTab] = useState<DecisionTab>(
    TABS.find((candidate) => candidate === typed.decision) ?? 'approved',
  );
  const [change, setChange] = useState(typed.change === 'on');
  const id = useId();
  const texts = new Map(messages);
  const error = state.error === undefined ? undefined : (texts.get(state.error) ?? state.error);
  const needsReason = tab !== 'approved' || change;
  const blocked = tab === 'approved' && labels.verifyFirst !== null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    // Logical order: in right-to-left layouts ArrowLeft moves forward.
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = (event.key === 'ArrowRight') !== rtl;
    const next = forTab(forward ? NEXT : PREVIOUS, tab);
    setTab(next);
    document.getElementById(`${id}-${next}`)?.focus();
  };

  return (
    <>
      <input type="hidden" name="decision" value={tab} />
      <div
        role="tablist"
        aria-label={labels.tabs}
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 overflow-hidden rounded-control border border-line-strong"
      >
        {TABS.map((candidate, index) => (
          <button
            key={candidate}
            id={`${id}-${candidate}`}
            type="button"
            role="tab"
            aria-selected={tab === candidate}
            aria-controls={`${id}-panel`}
            tabIndex={tab === candidate ? 0 : -1}
            onClick={() => {
              setTab(candidate);
            }}
            className={cn(
              'h-9 cursor-pointer text-sm font-medium text-ink hover:bg-surface-muted',
              index > 0 && 'border-s border-line-strong',
              tab === candidate &&
                (candidate === 'approved'
                  ? 'bg-success-600 text-white hover:bg-success-600'
                  : candidate === 'rejected'
                    ? 'bg-danger-600 text-white hover:bg-danger-600'
                    : 'bg-warning-700 text-white hover:bg-warning-700'),
              transition,
              focusRing,
            )}
          >
            {forTab(labels.tab, candidate)}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-ink-muted">{forTab(labels.hint, tab)}</p>
        {error === undefined ? null : <Alert role="alert" tone="danger" title={error} />}
        {blocked ? <Alert tone="warning" title={labels.verifyFirst} /> : null}
        {tab === 'approved' ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="change"
              checked={change}
              onChange={(event) => {
                setChange(event.currentTarget.checked);
              }}
              className="size-4 accent-brand-600"
            />
            {labels.changeIncrement}
          </label>
        ) : null}
        {tab === 'approved' && change ? (
          <Field label={labels.approvedPercent} hint={labels.approvedPercentHint} required>
            {(ids) => (
              <Input
                id={ids.id}
                aria-describedby={ids.describedBy}
                name="approvedPercent"
                inputMode="decimal"
                autoComplete="off"
                required
                defaultValue={typed.approvedPercent}
                className="w-32 tabular-nums"
              />
            )}
          </Field>
        ) : null}
        {needsReason ? (
          <>
            <Field label={labels.reason} required>
              {(ids) => (
                <Select
                  // A new list for another tab: start from the placeholder.
                  key={tab}
                  id={ids.id}
                  aria-describedby={ids.describedBy}
                  name="reasonCode"
                  required
                  defaultValue={typed.decision === tab ? typed.reasonCode : ''}
                >
                  <option value="" disabled>
                    {labels.reasonPlaceholder}
                  </option>
                  {forTab(reasons, tab).map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={labels.commentRequired} required>
              {(ids) => (
                <Textarea
                  id={ids.id}
                  aria-describedby={ids.describedBy}
                  name="comment"
                  required
                  maxLength={maxComment}
                  defaultValue={typed.comment}
                  placeholder={forTab(labels.commentPlaceholder, tab)}
                />
              )}
            </Field>
          </>
        ) : null}
        <Button
          type="submit"
          variant={tab === 'approved' ? 'success' : tab === 'rejected' ? 'danger' : 'primary'}
          disabled={blocked}
          loading={pending}
          fullWidth
        >
          {pending ? labels.deciding : forTab(labels.confirm, tab)}
        </Button>
      </div>
    </>
  );
}
