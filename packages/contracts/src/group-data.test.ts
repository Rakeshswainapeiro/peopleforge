import { describe, expect, it } from 'vitest';
import {
  ALWAYS_REQUIRED,
  CORE_FIELD_KEYS,
  EmployeeQuerySchema,
  ExtractQuerySchema,
  PeriodSchema,
  PublishTemplateSchema,
  UploadFieldsSchema,
  UploadQuerySchema,
} from './group-data.js';
import {
  FlagQuerySchema,
  RULE_KINDS,
  RULE_THRESHOLD_UNIT,
  UpdateFlagSchema,
  UpdateRuleSchema,
} from './data-quality.js';

const ENTITY = '00000000-0000-4000-8000-0000000e000a';

const field = {
  key: 'project_code',
  label: { en: '  Project ', ar: '' },
  type: 'text',
  required: false,
  allowedValues: [],
  palmHrField: '',
};

describe('group data contracts [R2-01, R2-02, R2-08]', () => {
  it('takes periods as YYYY-MM months only', () => {
    expect(PeriodSchema.parse('2026-09')).toBe('2026-09');
    for (const bad of ['2026-13', '2026-9', '1999-01', '2026-09-01']) {
      expect(PeriodSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('keeps the always-required fields among the core fields', () => {
    expect(ALWAYS_REQUIRED.every((key) => CORE_FIELD_KEYS.includes(key))).toBe(true);
  });

  it('normalises a template field: trimmed label, empty Arabic and Palm HR field dropped', () => {
    const parsed = PublishTemplateSchema.parse({ version: 1, fields: [field] });
    expect(parsed.fields[0]).toEqual({
      ...field,
      label: { en: 'Project', ar: undefined },
      palmHrField: null,
    });
    const arabic = PublishTemplateSchema.parse({
      version: 1,
      fields: [{ ...field, label: { en: 'Project', ar: ' مشروع ' }, palmHrField: 'project' }],
    });
    expect(arabic.fields[0]).toMatchObject({ label: { ar: 'مشروع' }, palmHrField: 'project' });
    const noArabic = PublishTemplateSchema.parse({
      version: 1,
      fields: [{ ...field, label: { en: 'Project' }, palmHrField: null }],
    });
    expect(noArabic.fields[0]?.label.ar).toBeUndefined();
  });

  it('refuses bad keys, blank labels, unknown properties and empty templates', () => {
    for (const bad of [
      { version: 1, fields: [] },
      { version: 1, fields: [{ ...field, key: 'Project Code' }] },
      { version: 1, fields: [{ ...field, label: { en: '  ' } }] },
      { version: 1, fields: [{ ...field, extra: true }] },
      { version: 0, fields: [field] },
    ]) {
      expect(PublishTemplateSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('checks upload fields and list queries, with page defaults', () => {
    expect(UploadFieldsSchema.parse({ entityId: ENTITY, period: '2026-09' })).toEqual({
      entityId: ENTITY,
      period: '2026-09',
    });
    expect(UploadFieldsSchema.safeParse({ entityId: 'x', period: '2026-09' }).success).toBe(false);
    expect(UploadQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(UploadQuerySchema.safeParse({ pageSize: '7' }).success).toBe(false);
    expect(EmployeeQuerySchema.parse({ period: '2026-09', search: '  ' })).toEqual({
      period: '2026-09',
      page: 1,
      pageSize: 25,
    });
    expect(EmployeeQuerySchema.safeParse({ period: '2026-09', pageSize: '7' }).success).toBe(false);
  });

  it('reads the extract flags as booleans', () => {
    expect(ExtractQuerySchema.parse({ format: 'csv', period: '2026-09' }).allVersions).toBe(false);
    expect(
      ExtractQuerySchema.parse({ format: 'palmhr', period: '2026-09', allVersions: 'true' })
        .allVersions,
    ).toBe(true);
    expect(ExtractQuerySchema.safeParse({ format: 'pdf', period: '2026-09' }).success).toBe(false);
  });
});

describe('data quality contracts [R2-10, R2-11]', () => {
  it('gives every rule kind a threshold unit', () => {
    expect(RULE_KINDS.every((kind) => RULE_THRESHOLD_UNIT.has(kind))).toBe(true);
  });

  it('takes thresholds up to 999.99 or none', () => {
    expect(UpdateRuleSchema.parse({ threshold: ' 12.5 ', enabled: true })).toEqual({
      threshold: '12.5',
      enabled: true,
    });
    expect(UpdateRuleSchema.parse({ threshold: null, enabled: false }).threshold).toBeNull();
    for (const threshold of ['-1', '1000', '1.234', 'ten', '0', '0.00']) {
      expect(UpdateRuleSchema.safeParse({ threshold, enabled: true }).success).toBe(false);
    }
  });

  it('needs a note to resolve a flag; an empty note is none', () => {
    expect(UpdateFlagSchema.parse({ ownerId: null, status: 'in_progress', note: '  ' })).toEqual({
      ownerId: null,
      status: 'in_progress',
      note: null,
    });
    expect(
      UpdateFlagSchema.parse({ ownerId: 'u-1', status: 'resolved', note: 'Checked.' }).note,
    ).toBe('Checked.');
    const missing = UpdateFlagSchema.safeParse({ ownerId: null, status: 'resolved', note: null });
    expect(missing.error?.issues[0]).toMatchObject({ path: ['note'], message: 'note_required' });
  });

  it('checks flag list filters', () => {
    expect(FlagQuerySchema.parse({ rule: 'ANM-03' })).toEqual({
      rule: 'ANM-03',
      page: 1,
      pageSize: 10,
    });
    expect(FlagQuerySchema.safeParse({ rule: 'X' }).success).toBe(false);
    expect(FlagQuerySchema.safeParse({ pageSize: '7' }).success).toBe(false);
  });
});
