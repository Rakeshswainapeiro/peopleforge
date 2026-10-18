'use client';

import { Alert, Button, Field, Input, Select, Textarea } from '@peopleforge/ui';
import { useActionState } from 'react';
import { publishCriteriaAction, type CriteriaFormState } from '@/app/(portal)/settings/actions';
import type { CriterionFields } from '@/lib/settings-view';

export interface CriteriaSettingsLabels {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  arabicHint: string;
  justificationRequired: string;
  evidence: string;
  maxFileMb: string;
  maxFileHint: string;
  /** Evidence choices in order: required, optional, none. */
  policies: readonly { value: string; label: string }[];
  note: string;
  publish: string;
  publishing: string;
  /**
   * "Version {version} published." with the placeholder kept: labels cross from the server to
   * this client component, so they must be plain strings, not functions.
   */
  published: string;
}

export interface CriteriaSettingsFormProps {
  version: number;
  criteria: readonly CriterionFields[];
  maxFileMb: number;
  labels: CriteriaSettingsLabels;
  /** Translated texts for the error keys, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
}

const INITIAL: CriteriaFormState = {};

/**
 * Settings → Eligibility criteria (R1-05): each criterion's names, description, justification
 * and evidence rules, published together as the next version. A refused form keeps what was
 * typed; codes and order stay (C1…C5).
 */
export function CriteriaSettingsForm({
  version,
  criteria,
  maxFileMb,
  labels,
  messages,
}: CriteriaSettingsFormProps) {
  const [state, formAction, pending] = useActionState(publishCriteriaAction, INITIAL);
  const texts = new Map(messages);
  const error = state.error === undefined ? undefined : (texts.get(state.error) ?? state.error);
  const fields = state.fields ?? criteria;
  return (
    // Remounted after each attempt, so the fields show what the server now holds (or kept).
    <form key={state.attempt ?? 0} action={formAction} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="version" value={version} />
      {error === undefined ? null : <Alert role="alert" tone="danger" title={error} />}
      {state.published === undefined ? null : (
        <Alert
          role="status"
          tone="success"
          title={labels.published.replace('{version}', String(state.published))}
        />
      )}
      {fields.map((field) => (
        <fieldset
          key={field.code}
          className="grid gap-4 rounded-card border border-line p-4 md:grid-cols-2"
        >
          <legend className="px-1 text-sm font-semibold text-ink">{field.code}</legend>
          <input type="hidden" name="code" value={field.code} />
          <Field label={`${labels.nameEn} · ${field.code}`} required>
            {(ids) => (
              <Input
                id={ids.id}
                aria-describedby={ids.describedBy}
                name="nameEn"
                required
                maxLength={120}
                defaultValue={field.nameEn}
              />
            )}
          </Field>
          <Field label={`${labels.nameAr} · ${field.code}`} hint={labels.arabicHint}>
            {(ids) => (
              <Input
                id={ids.id}
                aria-describedby={ids.describedBy}
                name="nameAr"
                dir="rtl"
                lang="ar"
                maxLength={120}
                defaultValue={field.nameAr}
              />
            )}
          </Field>
          <Field label={`${labels.descriptionEn} · ${field.code}`} required>
            {(ids) => (
              <Textarea
                id={ids.id}
                aria-describedby={ids.describedBy}
                name="descriptionEn"
                required
                rows={3}
                maxLength={1000}
                defaultValue={field.descriptionEn}
              />
            )}
          </Field>
          <Field label={`${labels.descriptionAr} · ${field.code}`} hint={labels.arabicHint}>
            {(ids) => (
              <Textarea
                id={ids.id}
                aria-describedby={ids.describedBy}
                name="descriptionAr"
                dir="rtl"
                lang="ar"
                rows={3}
                maxLength={1000}
                defaultValue={field.descriptionAr}
              />
            )}
          </Field>
          <Field label={`${labels.evidence} · ${field.code}`}>
            {(ids) => (
              <Select
                id={ids.id}
                aria-describedby={ids.describedBy}
                name="evidencePolicy"
                defaultValue={field.evidencePolicy}
              >
                {labels.policies.map((policy) => (
                  <option key={policy.value} value={policy.value}>
                    {policy.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`${labels.maxFileMb} · ${field.code}`} hint={labels.maxFileHint}>
            {(ids) => (
              <Input
                id={ids.id}
                aria-describedby={ids.describedBy}
                name="maxFileMb"
                type="number"
                inputMode="numeric"
                min={1}
                max={maxFileMb}
                defaultValue={field.maxFileMb}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              name={`justification-${field.code}`}
              defaultChecked={field.justificationRequired}
              className="size-4 rounded accent-brand-600"
            />
            {labels.justificationRequired}
            <span className="sr-only"> · {field.code}</span>
          </label>
        </fieldset>
      ))}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">{labels.note}</p>
        <Button type="submit" icon="check" loading={pending}>
          {pending ? labels.publishing : labels.publish}
        </Button>
      </div>
    </form>
  );
}
