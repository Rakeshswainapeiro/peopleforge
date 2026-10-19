import { z } from 'zod';
import { DecimalString, PAGE_SIZES, SearchTextSchema } from './increment-requests.js';
import { LocaleSchema } from '@sirius/shared-types';
import { LocalisedTextSchema } from './me.js';

/**
 * Group-level employee data (R2-01 … R2-04, R2-08, R2-13, R2-14): the field template every
 * upload is checked against, subsidiary uploads and their versions, and the consolidated
 * records. The template is configuration (R2-02, NFR-CFG-01): placeholder fields until Sirius
 * HR agrees the list (BRD A3).
 */

/** A month of data, "2026-09". Data is as at the end of that month. */
export const PeriodSchema = z.string().regex(/^(20\d{2})-(0[1-9]|1[0-2])$/u, 'period');
export type Period = z.infer<typeof PeriodSchema>;

/** Fields every template has: the dashboards, comparisons and anomaly rules depend on them. */
export const CORE_FIELD_KEYS = [
  'employee_number',
  'full_name',
  'department',
  'designation',
  'grade',
  'gross_salary',
  'basic_salary',
  'currency',
  'date_joined',
  'date_of_birth',
  'gender',
  'nationality',
  'status',
  'date_left',
  'cost_centre',
] as const;
export type CoreFieldKey = (typeof CORE_FIELD_KEYS)[number];

/** Core fields that can't be made optional: the group dashboard is built on them. */
export const ALWAYS_REQUIRED: readonly CoreFieldKey[] = [
  'employee_number',
  'full_name',
  'department',
  'grade',
  'gross_salary',
  'currency',
  'date_joined',
  'date_of_birth',
  'gender',
  'status',
];

export const FieldTypeSchema = z.enum(['text', 'date', 'decimal', 'enum']);
export type FieldType = z.infer<typeof FieldTypeSchema>;

/** Values of the `status` field (employment status at period end). */
export const EMPLOYMENT_STATUSES = ['active', 'on_leave', 'left'] as const;
export const GENDERS = ['female', 'male'] as const;

export const TemplateFieldSchema = z.object({
  key: z.string(),
  label: LocalisedTextSchema,
  type: FieldTypeSchema,
  required: z.boolean(),
  /** A core field (fixed key and type) or one the admin added. */
  core: z.boolean(),
  /** For `enum` fields: the accepted values, as written in the file. */
  allowedValues: z.array(z.string()),
  /** The Palm HR (HRMS) field it maps to (R2-14); null until mapped (BRD A7). */
  palmHrField: z.string().nullable(),
});
export type TemplateField = z.infer<typeof TemplateFieldSchema>;

export const FieldTemplateSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  activatedAt: z.iso.datetime().nullable(),
  fields: z.array(TemplateFieldSchema),
});
export type FieldTemplate = z.infer<typeof FieldTemplateSchema>;

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((value) => value.normalize('NFC'));

/** PUT /settings/template: publishes the next template version (admins). */
export const PublishTemplateSchema = z.strictObject({
  version: z.number().int().min(1),
  fields: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/u, 'key'),
        label: z.strictObject({
          en: text(60),
          ar: z
            .string()
            .trim()
            .max(60)
            .optional()
            .transform((value) =>
              value === undefined || value === '' ? undefined : value.normalize('NFC'),
            ),
        }),
        type: FieldTypeSchema,
        required: z.boolean(),
        allowedValues: z.array(text(60)).max(50),
        palmHrField: z
          .string()
          .trim()
          .max(60)
          .nullable()
          .transform((value) => (value === null || value === '' ? null : value)),
      }),
    )
    .min(1)
    .max(60),
});
export type PublishTemplate = z.infer<typeof PublishTemplateSchema>;

/** Largest upload accepted (Excel or CSV) and most data rows read. */
export const MAX_UPLOAD_MB = 5;
export const MAX_UPLOAD_ROWS = 10_000;

export const UploadStatusSchema = z.enum(['rejected', 'accepted', 'superseded']);
export type UploadStatus = z.infer<typeof UploadStatusSchema>;

/** Why a row or column was refused (message keys in the web app). */
export const UploadIssueCodeSchema = z.enum([
  'unreadable',
  'macros',
  'too_large',
  'empty_file',
  'too_many_rows',
  'missing_column',
  'unknown_column',
  'duplicate_column',
  'formula',
  'required',
  'invalid_date',
  'invalid_number',
  'not_allowed',
  'too_long',
  'duplicate_employee',
  'invalid_currency',
  'left_without_date',
  'future_date',
  'date_order',
]);
export type UploadIssueCode = z.infer<typeof UploadIssueCodeSchema>;

export const UploadIssueSchema = z.object({
  /** The spreadsheet row (header = 1), or null for the file as a whole. */
  row: z.number().int().min(1).nullable(),
  /** The field key, or null for the row or file. */
  field: z.string().nullable(),
  code: UploadIssueCodeSchema,
  /** Errors reject the upload; warnings don't. */
  severity: z.enum(['error', 'warning']),
});
export type UploadIssue = z.infer<typeof UploadIssueSchema>;

/** How an accepted upload compares with the subsidiary's previous period (R2-09). */
export const UploadComparisonSchema = z.object({
  previousPeriod: PeriodSchema.nullable(),
  headcount: z.number().int().min(0),
  previousHeadcount: z.number().int().min(0).nullable(),
  /** Payroll change in percent, one decimal ("2.7", "-1.0"); null without a prior period. */
  payrollChangePercent: z.string().nullable(),
  newRecords: z.number().int().min(0),
  left: z.number().int().min(0),
  /** In the previous period, absent now, without a leaving date. */
  missing: z.number().int().min(0),
  /** Present in both periods with any field changed. */
  changed: z.number().int().min(0),
  /** Entity-level warnings, e.g. headcount or payroll moved more than the threshold. */
  warnings: z.array(z.enum(['headcount_change', 'payroll_change'])),
});
export type UploadComparison = z.infer<typeof UploadComparisonSchema>;

export const UploadSchema = z.object({
  id: z.uuid(),
  /** "UP-0907". */
  reference: z.string(),
  entity: z.object({ id: z.uuid(), code: z.string() }),
  period: PeriodSchema,
  /** Version of this subsidiary's data for the period (1, 2, …); null when rejected. */
  version: z.number().int().min(1).nullable(),
  status: UploadStatusSchema,
  fileName: z.string(),
  rows: z.number().int().min(0),
  errors: z.number().int().min(0),
  warnings: z.number().int().min(0),
  templateVersion: z.number().int().min(1),
  uploadedByName: z.string(),
  uploadedAt: z.iso.datetime(),
  comparison: UploadComparisonSchema.nullable(),
  /** Anomaly flags raised by this upload (S9). */
  flags: z.number().int().min(0),
});
export type Upload = z.infer<typeof UploadSchema>;

export const UploadDetailSchema = UploadSchema.extend({
  /** At most MAX_LISTED_ISSUES; the error report file has them all. */
  issues: z.array(UploadIssueSchema),
  issuesTotal: z.number().int().min(0),
});
export type UploadDetail = z.infer<typeof UploadDetailSchema>;

export const MAX_LISTED_ISSUES = 200;

/** POST /group/uploads: multipart with these fields and `file`. */
export const UploadFieldsSchema = z.strictObject({
  entityId: z.uuid(),
  period: PeriodSchema,
});
export type UploadFields = z.infer<typeof UploadFieldsSchema>;

export const UploadQuerySchema = z.strictObject({
  entityId: z.uuid().optional(),
  period: PeriodSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), 'page_size')
    .default(PAGE_SIZES[0]),
});
export type UploadQuery = z.infer<typeof UploadQuerySchema>;

export const UploadPageSchema = z.object({
  items: z.array(UploadSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
export type UploadPage = z.infer<typeof UploadPageSchema>;

/** One consolidated record (R2-03, R2-04): the version in use for its subsidiary and period. */
export const EmployeeRecordSchema = z.object({
  id: z.uuid(),
  entity: z.object({ id: z.uuid(), code: z.string() }),
  period: PeriodSchema,
  employeeNumber: z.string(),
  fullName: z.string(),
  department: z.string(),
  designation: z.string().nullable(),
  grade: z.string(),
  /** Monthly gross; null for callers without compensation access. */
  grossSalary: DecimalString.nullable(),
  currency: z.string(),
  dateJoined: z.iso.date(),
  dateOfBirth: z.iso.date().nullable(),
  gender: z.string(),
  nationality: z.string().nullable(),
  status: z.string(),
  dateLeft: z.iso.date().nullable(),
  costCentre: z.string().nullable(),
  /** Fields the admin added to the template. */
  extra: z.record(z.string(), z.string()),
  upload: z.object({ id: z.uuid(), reference: z.string(), version: z.number().int().min(1) }),
});
export type EmployeeRecord = z.infer<typeof EmployeeRecordSchema>;

export const EmployeeQuerySchema = z.strictObject({
  period: PeriodSchema,
  entityId: z.uuid().optional(),
  department: z.string().trim().min(1).max(80).optional(),
  search: SearchTextSchema,
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), 'page_size')
    .default(PAGE_SIZES[1]),
});
export type EmployeeQuery = z.infer<typeof EmployeeQuerySchema>;

export const EmployeePageSchema = z.object({
  items: z.array(EmployeeRecordSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  /** For the cards: subsidiaries with data for the period, uploads kept, the latest change. */
  summary: z.object({
    entitiesWithData: z.number().int().min(0),
    entities: z.number().int().min(0),
    versions: z.number().int().min(0),
    lastChange: z
      .object({ at: z.iso.datetime(), entityCode: z.string(), version: z.number().int() })
      .nullable(),
  }),
  /** Departments with records in the period (for the filter). */
  departments: z.array(z.string()),
});
export type EmployeePage = z.infer<typeof EmployeePageSchema>;

/** One field that changed between two versions of an employee's record (R2-13). */
export const FieldChangeSchema = z.object({
  field: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});

/** An employee's records over time, every version, newest first (R2-04, R2-13). */
export const EmployeeHistorySchema = z.object({
  employeeNumber: z.string(),
  entity: z.object({ id: z.uuid(), code: z.string() }),
  versions: z.array(
    z.object({
      period: PeriodSchema,
      upload: z.object({
        id: z.uuid(),
        reference: z.string(),
        version: z.number().int().min(1),
        status: UploadStatusSchema,
        uploadedByName: z.string(),
        uploadedAt: z.iso.datetime(),
      }),
      record: EmployeeRecordSchema,
      /** Against the version before it (same period's earlier version, else previous period). */
      changes: z.array(FieldChangeSchema),
    }),
  ),
});
export type EmployeeHistory = z.infer<typeof EmployeeHistorySchema>;

export const ExtractFormatSchema = z.enum(['xlsx', 'csv', 'palmhr']);
export type ExtractFormat = z.infer<typeof ExtractFormatSchema>;

/** GET /group/extract: RP-08 raw extract of uploaded rows (R2-08, R2-14). */
export const ExtractQuerySchema = z.strictObject({
  format: ExtractFormatSchema,
  period: PeriodSchema,
  entityId: z.uuid().optional(),
  /** Every version uploaded (incl. superseded), not only those in use. */
  allVersions: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  locale: LocaleSchema.default('en'),
});
export type ExtractQuery = z.infer<typeof ExtractQuerySchema>;

/** GET /group/template and /group/uploads/:id/issues: the file's language. */
export const FileLocaleQuerySchema = z.strictObject({ locale: LocaleSchema.default('en') });
export type FileLocaleQuery = z.infer<typeof FileLocaleQuerySchema>;
