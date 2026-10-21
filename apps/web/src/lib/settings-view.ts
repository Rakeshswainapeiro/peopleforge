import {
  ReminderKindSchema,
  type CriteriaSettings,
  type ReminderKind,
} from '@peopleforge/contracts';
import type { ErrorCode, ErrorDetail } from '@sirius/shared-types';
import type { MessageKey } from '@/i18n/translator';

/**
 * Settings (R1-05, R1-13): the criteria form's fields as typed, and back to the API's shape.
 * The API validates again (PublishCriteriaSchema); this only gathers what was submitted.
 */

/** One criterion's fields as typed (strings, so a refused form shows them back unchanged). */
export interface CriterionFields {
  /** Stable row key in the form: the code, or `new-…` for a criterion being added. */
  key: string;
  /** Empty for a criterion added in this version (the API gives it the next code). */
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  justificationRequired: boolean;
  evidencePolicy: string;
  maxFileMb: string;
  /** '' (Pass or Fail by judgement), 'gte' or 'lte' (R1-05). */
  thresholdOperator: string;
  thresholdValue: string;
  thresholdUnit: string;
}

export type SettingsErrorKey = Extract<
  MessageKey,
  'settings.errors.invalid' | 'settings.errors.stale' | 'settings.errors.generic'
>;

export const SETTINGS_ERROR_KEYS: readonly SettingsErrorKey[] = [
  'settings.errors.invalid',
  'settings.errors.stale',
  'settings.errors.generic',
];

/** The fields of the active criteria, to start the form with. */
export function criteriaFields(settings: CriteriaSettings): CriterionFields[] {
  return settings.criteria.map((criterion) => ({
    key: criterion.code,
    code: criterion.code,
    nameEn: criterion.name.en,
    nameAr: criterion.name.ar ?? '',
    descriptionEn: criterion.description.en,
    descriptionAr: criterion.description.ar ?? '',
    justificationRequired: criterion.justificationRequired,
    evidencePolicy: criterion.evidencePolicy,
    maxFileMb: String(criterion.maxFileMb),
    thresholdOperator: criterion.threshold?.operator ?? '',
    thresholdValue: criterion.threshold?.value ?? '',
    thresholdUnit: criterion.threshold?.unit ?? 'rating',
  }));
}

/** A blank criterion to add (R1-05): judged Pass or Fail, evidence required, like C1–C5. */
export function newCriterionFields(key: string, maxFileMb: number): CriterionFields {
  return {
    key,
    code: '',
    nameEn: '',
    nameAr: '',
    descriptionEn: '',
    descriptionAr: '',
    justificationRequired: true,
    evidencePolicy: 'required',
    maxFileMb: String(maxFileMb),
    thresholdOperator: '',
    thresholdValue: '',
    thresholdUnit: 'rating',
  };
}

function strings(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((value) => (typeof value === 'string' ? value : ''));
}

/** The criteria form, one entry per criterion in the order shown. */
export function fieldsFromForm(formData: FormData): CriterionFields[] {
  const keys = strings(formData, 'rowKey');
  const column = (name: string) => {
    const values = strings(formData, name);
    return (index: number) => values.at(index) ?? '';
  };
  const code = column('code');
  const nameEn = column('nameEn');
  const nameAr = column('nameAr');
  const descriptionEn = column('descriptionEn');
  const descriptionAr = column('descriptionAr');
  const evidence = column('evidencePolicy');
  const maxFileMb = column('maxFileMb');
  const operator = column('thresholdOperator');
  const value = column('thresholdValue');
  const unit = column('thresholdUnit');
  return keys.map((key, index) => ({
    key,
    code: code(index),
    nameEn: nameEn(index),
    nameAr: nameAr(index),
    descriptionEn: descriptionEn(index),
    descriptionAr: descriptionAr(index),
    // One checkbox per row, named after its key (unticked boxes aren't submitted).
    justificationRequired: formData.get(`justification-${key}`) === 'on',
    evidencePolicy: evidence(index),
    maxFileMb: maxFileMb(index),
    thresholdOperator: operator(index),
    thresholdValue: value(index),
    thresholdUnit: unit(index),
  }));
}

/** The API's body for publishing (validated there and by PublishCriteriaSchema first). */
export function publishBody(version: number, fields: readonly CriterionFields[]): unknown {
  return {
    version,
    criteria: fields.map((field) => ({
      // A new criterion has no code yet: the API gives it the next one.
      ...(field.code === '' ? {} : { code: field.code }),
      name: { en: field.nameEn, ar: field.nameAr },
      description: { en: field.descriptionEn, ar: field.descriptionAr },
      justificationRequired: field.justificationRequired,
      evidencePolicy: field.evidencePolicy,
      maxFileMb: field.maxFileMb,
      threshold:
        field.thresholdOperator === ''
          ? null
          : {
              operator: field.thresholdOperator,
              value: field.thresholdValue.replace(/[\s%]/gu, ''),
              unit: field.thresholdUnit,
            },
    })),
  };
}

/** The message for an API refusal of a settings change. */
export function settingsErrorFor(
  code: ErrorCode,
  details: readonly ErrorDetail[],
): SettingsErrorKey {
  if (code === 'CONFLICT' && details.some((detail) => detail.path === 'version')) {
    return 'settings.errors.stale';
  }
  if (code === 'VALIDATION_FAILED') return 'settings.errors.invalid';
  return 'settings.errors.generic';
}

/** A reminder kind from a form, or null for anything else. */
export function reminderKindOf(value: FormDataEntryValue | null): ReminderKind | null {
  const kind = ReminderKindSchema.safeParse(value);
  return kind.success ? kind.data : null;
}
