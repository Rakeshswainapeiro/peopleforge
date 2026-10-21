'use client';

import { Alert, Button, Field, Input, Select, Textarea } from '@peopleforge/ui';
import { useActionState, useState } from 'react';
import { publishCriteriaAction, type CriteriaFormState } from '@/app/(portal)/settings/actions';
import { newCriterionFields, type CriterionFields } from '@/lib/settings-view';

interface Choice {
  value: string;
  label: string;
}

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
  policies: readonly Choice[];
  /** How the criterion passes: by judgement (''), or a measured value at least / at most. */
  passesOn: string;
  passModes: readonly Choice[];
  thresholdValue: string;
  thresholdValueHint: string;
  thresholdUnit: string;
  units: readonly Choice[];
  /** "New criterion": the legend of a criterion being added (its code comes on publishing). */
  newCriterion: string;
  addCriterion: string;
  /** "Remove {code}", with the placeholder kept (labels must be plain strings). */
  removeCriterion: string;
  /** "Remove this criterion": for one being added, which has no code yet. */
  removeNew: string;
  /** "Up to 10 criteria." */
  limit: string;
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
  /** Most criteria a version may have. */
  maxCriteria: number;
  labels: CriteriaSettingsLabels;
  /** Translated texts for the error keys, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
}

const INITIAL: CriteriaFormState = {};

/**
 * Settings → Eligibility criteria (R1-05): each criterion's names, description, justification
 * and evidence rules, and optionally a threshold on a measured value; criteria can be added
 * and removed. Everything is published together as the next version; requests already created
 * keep theirs. A refused form keeps what was typed.
 */
export function CriteriaSettingsForm(props: CriteriaSettingsFormProps) {
  const [state, formAction, pending] = useActionState(publishCriteriaAction, INITIAL);
  const texts = new Map(props.messages);
  const error = state.error === undefined ? undefined : (texts.get(state.error) ?? state.error);
  return (
    // Remounted after each attempt, so the rows show what the server now holds (or kept).
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="version" value={props.version} />
      {error === undefined ? null : <Alert role="alert" tone="danger" title={error} />}
      {state.published === undefined ? null : (
        <Alert
          role="status"
          tone="success"
          title={props.labels.published.replace('{version}', String(state.published))}
        />
      )}
      <CriteriaRows
        key={state.attempt ?? 0}
        initial={state.fields ?? props.criteria}
        maxFileMb={props.maxFileMb}
        maxCriteria={props.maxCriteria}
        labels={props.labels}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">{props.labels.note}</p>
        <Button type="submit" icon="check" loading={pending}>
          {pending ? props.labels.publishing : props.labels.publish}
        </Button>
      </div>
    </form>
  );
}

function CriteriaRows({
  initial,
  maxFileMb,
  maxCriteria,
  labels,
}: {
  initial: readonly CriterionFields[];
  maxFileMb: number;
  maxCriteria: number;
  labels: CriteriaSettingsLabels;
}) {
  const [rows, setRows] = useState(initial);
  const [added, setAdded] = useState(0);
  return (
    <>
      {rows.map((field) => (
        <CriterionRow
          key={field.key}
          field={field}
          maxFileMb={maxFileMb}
          labels={labels}
          canRemove={rows.length > 1}
          onRemove={() => {
            setRows((current) => current.filter((row) => row.key !== field.key));
          }}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          icon="plus"
          disabled={rows.length >= maxCriteria}
          onClick={() => {
            setRows((current) => [
              ...current,
              newCriterionFields(`new-${String(added + 1)}`, maxFileMb),
            ]);
            setAdded((count) => count + 1);
          }}
        >
          {labels.addCriterion}
        </Button>
        <span className="text-xs text-ink-muted">{labels.limit}</span>
      </div>
    </>
  );
}

function CriterionRow({
  field,
  maxFileMb,
  labels,
  canRemove,
  onRemove,
}: {
  field: CriterionFields;
  maxFileMb: number;
  labels: CriteriaSettingsLabels;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const [operator, setOperator] = useState(field.thresholdOperator);
  const title = field.code === '' ? labels.newCriterion : field.code;
  return (
    <fieldset className="grid gap-4 rounded-card border border-line p-4 md:grid-cols-2">
      <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
      <input type="hidden" name="rowKey" value={field.key} />
      <input type="hidden" name="code" value={field.code} />
      <div className="flex justify-end md:col-span-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon="trash"
          disabled={!canRemove}
          onClick={onRemove}
        >
          {field.code === '' ? labels.removeNew : labels.removeCriterion.replace('{code}', title)}
        </Button>
      </div>
      <Field label={`${labels.nameEn} · ${title}`} required>
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
      <Field label={`${labels.nameAr} · ${title}`} hint={labels.arabicHint}>
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
      <Field label={`${labels.descriptionEn} · ${title}`} required>
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
      <Field label={`${labels.descriptionAr} · ${title}`} hint={labels.arabicHint}>
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
      <Field label={`${labels.evidence} · ${title}`}>
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
      <Field label={`${labels.maxFileMb} · ${title}`} hint={labels.maxFileHint}>
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
      <Field label={`${labels.passesOn} · ${title}`}>
        {(ids) => (
          <Select
            id={ids.id}
            aria-describedby={ids.describedBy}
            name="thresholdOperator"
            value={operator}
            onChange={(event) => {
              setOperator(event.currentTarget.value);
            }}
          >
            {labels.passModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {/* Always posted, so the columns line up row by row; shown only with a threshold. */}
      <div hidden={operator === ''} className="grid grid-cols-2 gap-4">
        <Field label={`${labels.thresholdValue} · ${title}`} hint={labels.thresholdValueHint}>
          {(ids) => (
            <Input
              id={ids.id}
              aria-describedby={ids.describedBy}
              name="thresholdValue"
              inputMode="decimal"
              autoComplete="off"
              required={operator !== ''}
              defaultValue={field.thresholdValue}
              className="tabular-nums"
            />
          )}
        </Field>
        <Field label={`${labels.thresholdUnit} · ${title}`}>
          {(ids) => (
            <Select
              id={ids.id}
              aria-describedby={ids.describedBy}
              name="thresholdUnit"
              defaultValue={field.thresholdUnit}
            >
              {labels.units.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
        <input
          type="checkbox"
          name={`justification-${field.key}`}
          defaultChecked={field.justificationRequired}
          className="size-4 rounded accent-brand-600"
        />
        {labels.justificationRequired}
        <span className="sr-only"> · {title}</span>
      </label>
    </fieldset>
  );
}
