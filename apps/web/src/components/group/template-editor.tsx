'use client';

import { Alert, Button, Input, Select } from '@peopleforge/ui';
import { useActionState, useState } from 'react';
import { publishTemplateAction, type GroupFormState } from '@/app/(portal)/group/actions';

export interface TemplateFieldDraft {
  key: string;
  labelEn: string;
  labelAr: string;
  type: 'text' | 'date' | 'decimal' | 'enum';
  required: boolean;
  /** Comma-separated in the editor. */
  allowed: string;
  palmHr: string;
  /** A core field: key and type fixed, not removable. */
  core: boolean;
  /** Always required (the dashboards are built on it). */
  locked: boolean;
}

export interface TemplateEditorProps {
  version: number;
  fields: readonly TemplateFieldDraft[];
  types: readonly { value: TemplateFieldDraft['type']; label: string }[];
  labels: {
    form: string;
    key: string;
    labelEn: string;
    labelAr: string;
    type: string;
    required: string;
    allowed: string;
    palmHr: string;
    remove: string;
    add: string;
    note: string;
    publish: string;
    publishing: string;
    published: string;
  };
  messages: readonly (readonly [string, string])[];
}

const INITIAL: GroupFormState = {};

/** What the API takes (PublishTemplateSchema): the editor's rows in order. */
export function templateBody(version: number, fields: readonly TemplateFieldDraft[]) {
  return {
    version,
    fields: fields.map((field) => ({
      key: field.key.trim(),
      label: { en: field.labelEn, ar: field.labelAr },
      type: field.type,
      required: field.locked || field.required,
      allowedValues:
        field.type === 'enum'
          ? field.allowed
              .split(',')
              .map((value) => value.trim())
              .filter((value) => value !== '')
          : [],
      palmHrField: field.palmHr.trim() === '' ? null : field.palmHr.trim(),
    })),
  };
}

const blank = (index: number): TemplateFieldDraft => ({
  key: `field_${String(index)}`,
  labelEn: '',
  labelAr: '',
  type: 'text',
  required: false,
  allowed: '',
  palmHr: '',
  core: false,
  locked: false,
});

/**
 * The field template (R2-02, R2-14): labels in English and Arabic, type, required, allowed
 * values and the Palm HR field each column maps to. Core fields keep their key and type; admins
 * add their own. Publishing makes the next version; uploads already accepted keep theirs.
 */
export function TemplateEditor({ version, fields, types, labels, messages }: TemplateEditorProps) {
  const [rows, setRows] = useState<TemplateFieldDraft[]>([...fields]);
  const [state, formAction, pending] = useActionState(publishTemplateAction, INITIAL);
  const error =
    state.error === undefined ? undefined : (new Map(messages).get(state.error) ?? state.error);
  const change = (index: number, patch: Partial<TemplateFieldDraft>) => {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  };
  return (
    <form action={formAction} aria-label={labels.form} className="flex flex-col gap-4">
      <input type="hidden" name="template" value={JSON.stringify(templateBody(version, rows))} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-start text-sm">
          <thead className="text-xs text-ink-muted">
            <tr>
              <th className="px-2 py-2 text-start font-medium">{labels.key}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.labelEn}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.labelAr}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.type}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.required}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.allowed}</th>
              <th className="px-2 py-2 text-start font-medium">{labels.palmHr}</th>
              <th className="px-2 py-2">
                <span className="sr-only">{labels.remove}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className="border-t border-line align-top"
                data-testid={`field-${row.key}`}
              >
                <td className="px-2 py-2">
                  <Input
                    aria-label={`${labels.key} ${String(index + 1)}`}
                    value={row.key}
                    readOnly={row.core}
                    onChange={(event) => {
                      change(index, { key: event.currentTarget.value });
                    }}
                    className="min-w-44 font-mono"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    aria-label={`${labels.labelEn} ${row.key}`}
                    value={row.labelEn}
                    onChange={(event) => {
                      change(index, { labelEn: event.currentTarget.value });
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    aria-label={`${labels.labelAr} ${row.key}`}
                    dir="rtl"
                    lang="ar"
                    value={row.labelAr}
                    onChange={(event) => {
                      change(index, { labelAr: event.currentTarget.value });
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  <Select
                    aria-label={`${labels.type} ${row.key}`}
                    className="min-w-36"
                    value={row.type}
                    disabled={row.core}
                    onChange={(event) => {
                      const type = types.find(
                        (option) => option.value === event.currentTarget.value,
                      );
                      if (type !== undefined) change(index, { type: type.value });
                    }}
                  >
                    {types.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${labels.required} ${row.key}`}
                    checked={row.locked || row.required}
                    disabled={row.locked}
                    onChange={(event) => {
                      change(index, { required: event.currentTarget.checked });
                    }}
                    className="mt-2.5 size-4 rounded accent-brand-600"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    aria-label={`${labels.allowed} ${row.key}`}
                    value={row.allowed}
                    disabled={row.type !== 'enum'}
                    onChange={(event) => {
                      change(index, { allowed: event.currentTarget.value });
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    aria-label={`${labels.palmHr} ${row.key}`}
                    value={row.palmHr}
                    onChange={(event) => {
                      change(index, { palmHr: event.currentTarget.value });
                    }}
                    className="font-mono"
                  />
                </td>
                <td className="px-2 py-2">
                  {row.core ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      aria-label={`${labels.remove} ${row.key}`}
                      onClick={() => {
                        setRows((current) => current.filter((_, at) => at !== index));
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          type="button"
          variant="secondary"
          icon="plus"
          onClick={() => {
            setRows((current) => [...current, blank(current.length + 1)]);
          }}
        >
          {labels.add}
        </Button>
      </div>
      <p className="text-sm text-ink-muted">{labels.note}</p>
      {error === undefined ? null : <Alert role="alert" tone="danger" title={error} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? labels.publishing : labels.publish}
        </Button>
        {state.done === true && !pending ? (
          <span role="status" className="text-sm text-ink-muted">
            {labels.published}
          </span>
        ) : null}
      </div>
    </form>
  );
}
