'use client';

import { Button, Dialog } from '@peopleforge/ui';
import { useState } from 'react';
import { useDraftForm } from './draft-form';

export interface SubmitControlLabels {
  submit: string;
  submitting: string;
  cancel: string;
  /** "Submit INC-2026-0008 to Sirius HR?" */
  title: string;
  /** "2 employees go to Sirius HR for review. You can't edit the request afterwards." */
  body: string;
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
}

/**
 * Figma "Submit to Sirius HR" with a confirmation (R1-07): submitting can't be undone. The
 * dialog's button posts the page's draft form with `intent=submit`, so unsaved changes are
 * saved before the request goes.
 */
export function SubmitControl({ canSubmit, submitKey, describedBy, labels }: SubmitControlProps) {
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
        title={labels.title}
        actions={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              {labels.cancel}
            </Button>
            <Button
              type="submit"
              form={formId}
              name="intent"
              value="submit"
              loading={pending}
              loadingLabel={labels.submitting}
            >
              {labels.submit}
            </Button>
          </>
        }
      >
        <p>{labels.body}</p>
        <p className="mt-2">{labels.unsaved}</p>
      </Dialog>
    </>
  );
}
