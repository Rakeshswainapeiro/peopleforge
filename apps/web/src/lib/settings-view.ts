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
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  justificationRequired: boolean;
  evidencePolicy: string;
  maxFileMb: string;
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
    code: criterion.code,
    nameEn: criterion.name.en,
    nameAr: criterion.name.ar ?? '',
    descriptionEn: criterion.description.en,
    descriptionAr: criterion.description.ar ?? '',
    justificationRequired: criterion.justificationRequired,
    evidencePolicy: criterion.evidencePolicy,
    maxFileMb: String(criterion.maxFileMb),
  }));
}

function strings(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((value) => (typeof value === 'string' ? value : ''));
}

/** The criteria form, one entry per criterion in the order shown. */
export function fieldsFromForm(formData: FormData): CriterionFields[] {
  const codes = strings(formData, 'code');
  const column = (name: string) => {
    const values = strings(formData, name);
    return (index: number) => values.at(index) ?? '';
  };
  const nameEn = column('nameEn');
  const nameAr = column('nameAr');
  const descriptionEn = column('descriptionEn');
  const descriptionAr = column('descriptionAr');
  const evidence = column('evidencePolicy');
  const maxFileMb = column('maxFileMb');
  return codes.map((code, index) => ({
    code,
    nameEn: nameEn(index),
    nameAr: nameAr(index),
    descriptionEn: descriptionEn(index),
    descriptionAr: descriptionAr(index),
    // One checkbox per criterion, named after its code (unticked boxes aren't submitted).
    justificationRequired: formData.get(`justification-${code}`) === 'on',
    evidencePolicy: evidence(index),
    maxFileMb: maxFileMb(index),
  }));
}

/** The API's body for publishing (validated there and by PublishCriteriaSchema first). */
export function publishBody(version: number, fields: readonly CriterionFields[]): unknown {
  return {
    version,
    criteria: fields.map((field) => ({
      code: field.code,
      name: { en: field.nameEn, ar: field.nameAr },
      description: { en: field.descriptionEn, ar: field.descriptionAr },
      justificationRequired: field.justificationRequired,
      evidencePolicy: field.evidencePolicy,
      maxFileMb: field.maxFileMb,
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
