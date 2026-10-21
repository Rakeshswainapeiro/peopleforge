import { describe, expect, it } from 'vitest';
import { criteriaSettings } from '@/test-support/requests';
import {
  criteriaFields,
  fieldsFromForm,
  newCriterionFields,
  publishBody,
  reminderKindOf,
  settingsErrorFor,
} from './settings-view';

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe('settings views [R1-05, R1-13]', () => {
  it('starts the form from the active criteria, Arabic empty when there is none', () => {
    const settings = criteriaSettings();
    const first = settings.criteria[0];
    if (first === undefined) throw new Error('fixture');
    const withArabic = criteriaSettings({
      criteria: [
        { ...first, name: { en: 'Rating', ar: 'التقييم' }, description: { en: 'D', ar: 'و' } },
      ],
    });
    expect(criteriaFields(withArabic)).toEqual([
      {
        key: 'C1',
        code: 'C1',
        nameEn: 'Rating',
        nameAr: 'التقييم',
        descriptionEn: 'D',
        descriptionAr: 'و',
        justificationRequired: true,
        evidencePolicy: 'required',
        maxFileMb: '10',
        thresholdOperator: '',
        thresholdValue: '',
        thresholdUnit: 'rating',
      },
    ]);
    expect(criteriaFields(settings)[0]?.nameAr).toBe('');
    const rated = criteriaSettings({
      criteria: [{ ...first, threshold: { operator: 'lte', value: '5', unit: 'days' } }],
    });
    expect(criteriaFields(rated)[0]).toMatchObject({
      thresholdOperator: 'lte',
      thresholdValue: '5',
      thresholdUnit: 'days',
    });
    expect(newCriterionFields('new-1', 10)).toMatchObject({
      key: 'new-1',
      code: '',
      justificationRequired: true,
      evidencePolicy: 'required',
      maxFileMb: '10',
      thresholdOperator: '',
    });
  });

  it('reads the form back per row, unticked boxes as false, missing fields as empty', () => {
    const fields = fieldsFromForm(
      form([
        ['rowKey', 'C1'],
        ['rowKey', 'new-1'],
        ['code', 'C1'],
        ['code', ''],
        ['nameEn', 'Rating'],
        ['nameEn', 'Attendance'],
        ['nameAr', ''],
        ['descriptionEn', 'Latest appraisal.'],
        ['evidencePolicy', 'required'],
        ['evidencePolicy', 'none'],
        ['maxFileMb', '5'],
        ['thresholdOperator', ''],
        ['thresholdOperator', 'gte'],
        ['thresholdValue', ''],
        ['thresholdValue', ' 95 %'],
        ['thresholdUnit', 'rating'],
        ['thresholdUnit', 'percent'],
        ['justification-C1', 'on'],
      ]),
    );
    expect(fields).toEqual([
      {
        key: 'C1',
        code: 'C1',
        nameEn: 'Rating',
        nameAr: '',
        descriptionEn: 'Latest appraisal.',
        descriptionAr: '',
        justificationRequired: true,
        evidencePolicy: 'required',
        maxFileMb: '5',
        thresholdOperator: '',
        thresholdValue: '',
        thresholdUnit: 'rating',
      },
      {
        key: 'new-1',
        code: '',
        nameEn: 'Attendance',
        nameAr: '',
        descriptionEn: '',
        descriptionAr: '',
        justificationRequired: false,
        evidencePolicy: 'none',
        maxFileMb: '',
        thresholdOperator: 'gte',
        thresholdValue: ' 95 %',
        thresholdUnit: 'percent',
      },
    ]);
    const files = new FormData();
    files.append('rowKey', 'x');
    files.append('code', new File(['x'], 'x.txt'));
    expect(fieldsFromForm(files)[0]?.code).toBe('');
    // A new criterion has no code; a threshold travels as one object, "95 %" as "95".
    expect(publishBody(2, fields)).toEqual({
      version: 2,
      criteria: [
        {
          code: 'C1',
          name: { en: 'Rating', ar: '' },
          description: { en: 'Latest appraisal.', ar: '' },
          justificationRequired: true,
          evidencePolicy: 'required',
          maxFileMb: '5',
          threshold: null,
        },
        {
          name: { en: 'Attendance', ar: '' },
          description: { en: '', ar: '' },
          justificationRequired: false,
          evidencePolicy: 'none',
          maxFileMb: '',
          threshold: { operator: 'gte', value: '95', unit: 'percent' },
        },
      ],
    });
  });

  it('words refusals and reads reminder kinds', () => {
    expect(settingsErrorFor('CONFLICT', [{ path: 'version', code: 'stale' }])).toBe(
      'settings.errors.stale',
    );
    expect(settingsErrorFor('VALIDATION_FAILED', [])).toBe('settings.errors.invalid');
    expect(settingsErrorFor('CONFLICT', [])).toBe('settings.errors.generic');
    expect(reminderKindOf('review_overdue')).toBe('review_overdue');
    expect(reminderKindOf('constructor')).toBeNull();
    expect(reminderKindOf(null)).toBeNull();
  });
});
