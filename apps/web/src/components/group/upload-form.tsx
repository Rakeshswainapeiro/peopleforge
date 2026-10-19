'use client';

import { Alert, Button, Field, Input, Select } from '@peopleforge/ui';
import { useActionState } from 'react';
import { uploadGroupDataAction, type GroupFormState } from '@/app/(portal)/group/actions';

export interface UploadFormProps {
  entities: readonly { value: string; label: string }[];
  periods: readonly { value: string; label: string }[];
  /** The month chosen at first (last month). */
  period: string;
  labels: {
    form: string;
    entity: string;
    period: string;
    file: string;
    fileHint: string;
    upload: string;
    uploading: string;
  };
  /** Translated texts for the error keys, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
}

const INITIAL: GroupFormState = {};

/**
 * Upload a subsidiary's employee data for a month (R2-01): Excel or CSV, the template's columns.
 * The API scans and checks it before answering; then the result page opens.
 */
export function UploadForm({ entities, periods, period, labels, messages }: UploadFormProps) {
  const [state, formAction, pending] = useActionState(uploadGroupDataAction, INITIAL);
  const error =
    state.error === undefined ? undefined : (new Map(messages).get(state.error) ?? state.error);
  return (
    <form action={formAction} aria-label={labels.form} className="flex flex-wrap items-start gap-4">
      {entities.length === 1 ? (
        <input type="hidden" name="entityId" value={entities[0]?.value} />
      ) : (
        <Field label={labels.entity} required className="w-full sm:w-48">
          {(ids) => (
            <Select id={ids.id} name="entityId" required defaultValue={entities[0]?.value}>
              {entities.map((entity) => (
                <option key={entity.value} value={entity.value}>
                  {entity.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label={labels.period} required className="w-full sm:w-56">
        {(ids) => (
          <Select id={ids.id} name="period" required defaultValue={period}>
            {periods.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={labels.file}
        hint={labels.fileHint}
        required
        className="min-w-0 flex-1 basis-72"
      >
        {(ids) => (
          <Input
            id={ids.id}
            aria-describedby={ids.describedBy}
            type="file"
            name="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="py-1.5 file:me-3 file:rounded-control file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-brand-600"
          />
        )}
      </Field>
      {/* Aligned with the controls (below their labels). */}
      <div className="w-full pt-0 sm:w-auto sm:pt-5">
        <Button type="submit" icon="upload" loading={pending}>
          {pending ? labels.uploading : labels.upload}
        </Button>
      </div>
      {error === undefined ? null : (
        <Alert role="alert" tone="danger" title={error} className="w-full" />
      )}
    </form>
  );
}
