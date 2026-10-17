'use client';

import {
  Badge,
  Button,
  Dialog,
  Field,
  StatCard,
  Table,
  TBody,
  Td,
  Textarea,
  Th,
  THead,
  Tr,
} from '@peopleforge/ui';
import { useState } from 'react';
import { useDraftForm } from './draft-form';

export interface SubmitControlLabels {
  /** The button that opens the dialog: "Submit to Sirius HR". */
  submit: string;
  /** The dialog's confirm button: "Yes, submit to Sirius HR". */
  confirm: string;
  submitting: string;
  /** "Go back and edit". */
  back: string;
}

export interface SubmitDialogRow {
  id: string;
  name: string;
  number: string;
  grade: string;
  proposed: string;
  /** "5 of 5 complete". */
  criteria: string;
}

/** What the confirmation shows (Figma "Submit INC-2026-0152 to Sirius HR?"). */
export interface SubmitDialogView {
  title: string;
  intro: string;
  figures: readonly { label: string; value: string }[];
  table: { caption: string; employee: string; grade: string; proposed: string; criteria: string };
  rows: readonly SubmitDialogRow[];
  /** What happens on submit. */
  note: string;
  /** "Anything you changed on this page is saved first." */
  unsaved: string;
}

export interface SubmitControlProps {
  /** Every employee is ready (saved state): otherwise the button stays disabled. */
  canSubmit: boolean;
  /** Idempotency key for this page view: a double click or retry can't submit twice. */
  submitKey: string;
  /** Id of the caption describing the button. */
  describedBy: string;
  labels: SubmitControlLabels;
  dialog: SubmitDialogView;
  /** What confirming does: submit a draft, or resubmit returned employees (R1-08). */
  intent?: 'submit' | 'resubmit';
  /** A note to Sirius HR, asked for in the dialog when resubmitting. */
  note?: { label: string; placeholder: string; maxLength: number } | undefined;
}

/**
 * Figma "Submit to Sirius HR" with its confirmation (R1-07): the employees about to go, their
 * proposals and criteria, and the totals, because submitting can't be undone. The confirm button
 * posts the page's draft form with `intent=submit`, so unsaved changes are saved first.
 */
export function SubmitControl({
  canSubmit,
  submitKey,
  describedBy,
  labels,
  dialog,
  intent = 'submit',
  note,
}: SubmitControlProps) {
  const { formId, pending } = useDraftForm();
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <input type="hidden" name="submitKey" value={submitKey} form={formId} />
      <Button
        size="lg"
        fullWidth
        disabled={!canSubmit}
        aria-describedby={describedBy}
        onClick={() => {
          setOpen(true);
        }}
      >
        {labels.submit}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        role="alertdialog"
        size="lg"
        // While the draft is saved and submitted, Esc and the backdrop do nothing.
        dismissible={!pending}
        title={dialog.title}
        actions={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              {labels.back}
            </Button>
            <Button type="submit" form={formId} name="intent" value={intent} loading={pending}>
              {/* The label itself says what's happening; the spinner is decoration. */}
              {pending ? labels.submitting : labels.confirm}
            </Button>
          </>
        }
      >
        <p>{dialog.intro}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {dialog.figures.map((figure) => (
            <li key={figure.label}>
              <StatCard subtle label={figure.label} value={figure.value} />
            </li>
          ))}
        </ul>
        {/* Long requests scroll inside the dialog, the buttons stay in view. */}
        <div className="mt-4 max-h-64 overflow-y-auto">
          <Table caption={dialog.table.caption}>
            <THead>
              <tr>
                <Th>{dialog.table.employee}</Th>
                <Th>{dialog.table.grade}</Th>
                <Th>{dialog.table.proposed}</Th>
                <Th>{dialog.table.criteria}</Th>
              </tr>
            </THead>
            <TBody>
              {dialog.rows.map((row) => (
                <Tr key={row.id}>
                  <Td className="py-2.5">
                    <span className="font-semibold text-ink">{row.name}</span>{' '}
                    <span className="text-xs text-ink-muted">{row.number}</span>
                  </Td>
                  <Td className="py-2.5">{row.grade}</Td>
                  <Td className="py-2.5 tabular-nums">{row.proposed}</Td>
                  <Td className="py-2.5">
                    <Badge tone="success">{row.criteria}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        {note === undefined ? null : (
          <Field label={note.label} className="mt-4">
            {(ids) => (
              <Textarea
                id={ids.id}
                aria-describedby={ids.describedBy}
                name="note"
                form={formId}
                maxLength={note.maxLength}
                placeholder={note.placeholder}
              />
            )}
          </Field>
        )}
        <p className="mt-4 rounded-card border border-brand-100 bg-brand-50 px-4 py-3 text-xs text-ink">
          {dialog.note} {dialog.unsaved}
        </p>
      </Dialog>
    </>
  );
}
