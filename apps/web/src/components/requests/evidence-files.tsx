'use client';

import {
  Alert,
  FileChip,
  Icon,
  Spinner,
  buttonClasses,
  cn,
  focusRing,
  transition,
} from '@peopleforge/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ChangeEvent } from 'react';
import {
  removeEvidenceAction,
  uploadEvidenceAction,
  type EvidenceActionResult,
} from '@/app/(portal)/requests/actions';

export interface EvidenceFileView {
  id: string;
  fileName: string;
  /** e.g. "PDF · 2 KB". */
  meta: string;
  href: string;
  downloadLabel: string;
  removeLabel: string;
}

export interface EvidenceFilesLabels {
  attach: string;
  /** Accessible name of the file input, e.g. "Attach a file for C1". */
  attachFor: string;
  uploading: string;
  noFiles: string;
}

export interface EvidenceFilesProps {
  requestId: string;
  lineId: string;
  criterionId: string;
  files: readonly EvidenceFileView[];
  /** The file picker's filter, e.g. "application/pdf,image/png". The API checks the content. */
  accept: string;
  maxBytes: number;
  /** False once the criterion holds the most files allowed. */
  canAdd: boolean;
  labels: EvidenceFilesLabels;
  /** Translated texts for the error keys an upload can return, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
}

/**
 * Files under one criterion (R1-04). Choosing a file uploads it at once (scanned before it's
 * kept) and refreshes the page; nothing typed elsewhere is lost, because an upload doesn't
 * change the draft's version. Removing works the same way.
 */
export function EvidenceFiles({
  requestId,
  lineId,
  criterionId,
  files,
  accept,
  maxBytes,
  canAdd,
  labels,
  messages,
}: EvidenceFilesProps) {
  const router = useRouter();
  const inputId = useId();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const texts = new Map(messages);

  function finish(result: EvidenceActionResult): void {
    if (result.ok) {
      setError(undefined);
      router.refresh();
    } else {
      setError(texts.get(result.error) ?? result.error);
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again (after a fix) still triggers a change.
    event.target.value = '';
    if (file === undefined) return;
    // Spares a 10 MB round trip; the API enforces the limit regardless.
    if (file.size > maxBytes) {
      finish({ ok: false, error: 'evidence.errors.tooLarge' });
      return;
    }
    const form = new FormData();
    form.set('requestId', requestId);
    form.set('lineId', lineId);
    form.set('criterionId', criterionId);
    form.set('file', file);
    startTransition(async () => {
      finish(await uploadEvidenceAction(form));
    });
  }

  function remove(evidenceId: string): void {
    startTransition(async () => {
      finish(await removeEvidenceAction(requestId, evidenceId));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {files.length === 0 ? (
        <p className="text-xs text-ink-subtle">{labels.noFiles}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {files.map((file) => (
            <li key={file.id} className="min-w-0 max-w-full">
              <FileChip
                name={file.fileName}
                meta={file.meta}
                href={file.href}
                downloadLabel={file.downloadLabel}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      remove(file.id);
                    }}
                    disabled={pending}
                    aria-label={file.removeLabel}
                    title={file.removeLabel}
                    className={cn(
                      'inline-flex size-7 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50',
                      transition,
                      focusRing,
                    )}
                  >
                    <Icon name="x" className="size-4" />
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <div className="flex items-center gap-3">
          {/* The native file input takes focus and opens the picker with the keyboard; it is
              visually hidden and drawn as the button-like label that follows it. */}
          <input
            id={inputId}
            type="file"
            accept={accept}
            aria-label={labels.attachFor}
            onChange={upload}
            disabled={pending}
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
            aria-hidden="true"
            className={cn(
              buttonClasses({ variant: 'outline', size: 'sm' }),
              'cursor-pointer peer-disabled:pointer-events-none peer-disabled:opacity-60',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500',
            )}
          >
            <Icon name="paperclip" className="size-4" />
            {labels.attach}
          </label>
          {pending ? (
            <span role="status" className="flex items-center gap-2 text-xs text-ink-muted">
              <Spinner />
              {labels.uploading}
            </span>
          ) : null}
        </div>
      ) : null}
      {error === undefined ? null : <Alert role="alert" tone="danger" title={error} />}
    </div>
  );
}
