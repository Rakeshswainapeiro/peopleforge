import { describe, expect, it } from 'vitest';
import { PublishCriteriaSchema, ReminderRuleSchema, UpdateReminderRuleSchema } from './settings.js';

const criterion = {
  code: 'C1',
  name: { en: '  Performance rating ', ar: 'تقييم الأداء' },
  description: { en: 'Latest appraisal meets the minimum rating.', ar: '' },
  justificationRequired: true,
  evidencePolicy: 'required',
  maxFileMb: '10',
};

describe('settings contracts [R1-05, R1-13, NFR-CFG-01]', () => {
  it('takes trimmed, NFC-normalised criteria; Arabic optional, empty Arabic dropped', () => {
    const parsed = PublishCriteriaSchema.parse({ version: 1, criteria: [criterion] });
    expect(parsed.criteria[0]).toEqual({
      ...criterion,
      name: { en: 'Performance rating', ar: 'تقييم الأداء' },
      description: { en: 'Latest appraisal meets the minimum rating.', ar: undefined },
      maxFileMb: 10,
      threshold: null,
    });
    // "e" + combining acute becomes "é".
    const nfd = PublishCriteriaSchema.parse({
      version: 1,
      criteria: [{ ...criterion, name: { en: 'Résumé' } }],
    });
    expect(nfd.criteria[0]?.name.en).toBe('Résumé');
  });

  it('refuses blank names, unknown fields, bad codes and file sizes over the cap', () => {
    const bad = (change: Record<string, unknown>) =>
      PublishCriteriaSchema.safeParse({ version: 1, criteria: [{ ...criterion, ...change }] })
        .success;
    expect(bad({ name: { en: '   ' } })).toBe(false);
    expect(bad({ code: 'X1' })).toBe(false);
    expect(bad({ maxFileMb: 11 })).toBe(false);
    expect(bad({ evidencePolicy: 'maybe' })).toBe(false);
    expect(bad({ extra: true })).toBe(false);
    expect(bad({ name: { en: 'x'.repeat(121) } })).toBe(false);
    expect(PublishCriteriaSchema.safeParse({ version: 1, criteria: [] }).success).toBe(false);
  });

  it('adds a criterion without a code, with a threshold, and refuses duplicates and >10 [R1-05]', () => {
    const added = PublishCriteriaSchema.parse({
      version: 1,
      criteria: [
        criterion,
        {
          ...criterion,
          code: undefined,
          threshold: { operator: 'gte', value: '95', unit: 'percent' },
        },
      ],
    });
    expect(added.criteria[1]).toMatchObject({
      code: undefined,
      threshold: { operator: 'gte', value: '95', unit: 'percent' },
    });
    expect(
      PublishCriteriaSchema.safeParse({ version: 1, criteria: [criterion, criterion] }).success,
    ).toBe(false);
    expect(
      PublishCriteriaSchema.safeParse({
        version: 1,
        criteria: Array.from({ length: 11 }, () => ({ ...criterion, code: undefined })),
      }).success,
    ).toBe(false);
    expect(
      PublishCriteriaSchema.safeParse({
        version: 1,
        criteria: [{ ...criterion, threshold: { operator: 'gte', value: '-1', unit: 'rating' } }],
      }).success,
    ).toBe(false);
  });

  it('takes reminder days 1 to 30', () => {
    expect(UpdateReminderRuleSchema.parse({ days: '3', enabled: true })).toEqual({
      days: 3,
      enabled: true,
    });
    expect(UpdateReminderRuleSchema.safeParse({ days: 0, enabled: true }).success).toBe(false);
    expect(UpdateReminderRuleSchema.safeParse({ days: 31, enabled: true }).success).toBe(false);
    expect(
      ReminderRuleSchema.safeParse({
        kind: 'review_overdue',
        days: 2,
        enabled: true,
        updatedAt: '2026-10-18T06:00:00.000Z',
        updatedByName: null,
      }).success,
    ).toBe(true);
  });
});
