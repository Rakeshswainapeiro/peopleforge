import type {
  AcceptInput,
  DataQualityRepository,
  FlagContext,
  FlagRecord,
  GroupDataRepository,
  NewNotification,
  RuleRecord,
  Scope,
  SnapshotInput,
  SnapshotRecord,
  TemplateFieldRecord,
  TemplateRecord,
  UploadInput,
  UploadRecord,
} from '@peopleforge/db';
import { vi, type Mock } from 'vitest';
import { SUB_A } from './factory.js';

/** The placeholder template of migration 0013 (BRD A3 pending), as the repository returns it. */
const field = (
  key: string,
  en: string,
  type: TemplateFieldRecord['type'],
  required: boolean,
  allowedValues: string[] = [],
): TemplateFieldRecord => ({
  key,
  label: { en },
  type,
  required,
  core: true,
  allowedValues,
  palmHrField: null,
});

export const TEMPLATE_FIELDS: readonly TemplateFieldRecord[] = [
  field('employee_number', 'Employee ID', 'text', true),
  field('full_name', 'Full name', 'text', true),
  field('department', 'Department', 'text', true),
  field('designation', 'Designation', 'text', true),
  field('grade', 'Grade', 'text', true),
  field('gross_salary', 'Gross monthly salary', 'decimal', true),
  field('basic_salary', 'Basic monthly salary', 'decimal', false),
  field('currency', 'Currency', 'text', true),
  field('date_joined', 'Date of joining', 'date', true),
  field('date_of_birth', 'Date of birth', 'date', true),
  field('gender', 'Gender', 'enum', true, ['female', 'male']),
  field('nationality', 'Nationality', 'text', false),
  field('status', 'Employment status', 'enum', true, ['active', 'on_leave', 'left']),
  field('date_left', 'Leaving date', 'date', false),
  field('cost_centre', 'Cost centre', 'text', false),
];

/** The template's header row, in order. */
export const TEMPLATE_HEADERS = TEMPLATE_FIELDS.map((entry) => entry.label.en);

/** A valid employee record (one row of an upload). */
export function snapshot(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    rowNumber: 2,
    employeeNumber: 'EMP-1101',
    fullName: 'Aisha Rahman',
    department: 'Finance',
    designation: 'Analyst',
    grade: 'G5',
    grossSalary: '14200.00',
    basicSalary: '9000.00',
    currency: 'AED',
    dateJoined: '2020-01-15',
    dateOfBirth: '1990-05-01',
    gender: 'female',
    nationality: 'AE',
    status: 'active',
    dateLeft: null,
    costCentre: 'CC-10',
    extra: {},
    ...overrides,
  };
}

/** A CSV row matching TEMPLATE_HEADERS for `snapshot()` values. */
export const VALID_ROW = [
  'EMP-1101',
  'Aisha Rahman',
  'Finance',
  'Analyst',
  'G5',
  '14200.00',
  '9000.00',
  'AED',
  '2020-01-15',
  '1990-05-01',
  'female',
  'AE',
  'active',
  '',
  'CC-10',
];

// ---- Fakes for the API tests (packages/db proves the real repositories) ----

export const TEMPLATE_ID = '00000000-0000-4000-8000-0000000f7e01';
export const UPLOAD_ID = '66666666-6666-4666-8666-666666666661';
export const RECORD_ID = '77777777-7777-4777-8777-777777777771';
export const FLAG_ID = '88888888-8888-4888-8888-888888888881';

export const TEMPLATE: TemplateRecord = {
  id: TEMPLATE_ID,
  version: 1,
  activatedAt: new Date('2026-10-01T00:00:00Z'),
  fields: [...TEMPLATE_FIELDS],
};

export function uploadRecord(overrides: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: UPLOAD_ID,
    reference: 'UP-0001',
    entity: { id: SUB_A, code: 'SUB-A' },
    period: '2026-09',
    version: 1,
    status: 'accepted',
    fileName: 'employees.csv',
    rows: 1,
    errors: 0,
    warnings: 0,
    templateVersion: 1,
    uploadedBy: 'alpha',
    uploadedByName: 'Alpha HR',
    uploadedAt: new Date('2026-10-05T06:00:00Z'),
    comparison: null,
    flags: 0,
    issues: [],
    ...overrides,
  };
}

export function snapshotRecord(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    ...snapshot(),
    id: RECORD_ID,
    entityId: SUB_A,
    entityCode: 'SUB-A',
    period: '2026-09',
    upload: { id: UPLOAD_ID, reference: 'UP-0001', version: 1, status: 'accepted' },
    ...overrides,
  };
}

export function flagRecord(overrides: Partial<FlagRecord> = {}): FlagRecord {
  return {
    id: FLAG_ID,
    reference: 'AN-0001',
    entity: { id: SUB_A, code: 'SUB-A' },
    period: '2026-09',
    upload: { id: UPLOAD_ID, reference: 'UP-0001' },
    ruleCode: 'ANM-03',
    ruleKind: 'salary_change',
    employeeNumber: 'EMP-1101',
    employeeName: 'Aisha Rahman',
    field: 'gross_salary',
    detail: { previous: '12000.00', current: '14200.00' },
    owner: { id: 'alpha', name: 'Alpha HR' },
    status: 'open',
    note: null,
    resolvedReason: null,
    createdAt: new Date('2026-10-05T06:00:00Z'),
    updatedAt: new Date('2026-10-05T06:00:00Z'),
    resolvedAt: null,
    ...overrides,
  };
}

type Mocked<T> = { [K in keyof T]: T[K] & Mock };

/** A group data repository answering like the real one for one subsidiary and month. */
export function workingGroupData(): Mocked<GroupDataRepository> {
  return {
    activeTemplate: vi.fn(() => Promise.resolve(TEMPLATE)),
    publishTemplate: vi.fn(() => Promise.resolve({ ...TEMPLATE, version: 2 })),
    gradeBands: vi.fn(() => Promise.resolve([])),
    previousPeriod: vi.fn(() => Promise.resolve(null)),
    recordsInUse: vi.fn(() => Promise.resolve([])),
    salaryHistory: vi.fn(() => Promise.resolve([])),
    numbersElsewhere: vi.fn(() => Promise.resolve([])),
    recordRejected: vi.fn((_scope: Scope, input: UploadInput) =>
      Promise.resolve(
        uploadRecord({
          id: input.id,
          status: 'rejected',
          version: null,
          rows: input.rows,
          errors: input.issues.filter((issue) => issue.severity === 'error').length,
          issues: [...input.issues],
        }),
      ),
    ),
    accept: vi.fn((_scope: Scope, input: AcceptInput) => {
      input.notifications({
        reference: 'UP-0002',
        entityId: input.entityId,
        entityCode: 'SUB-A',
        period: input.period,
        version: 1,
        uploadId: input.id,
        flags: input.flags.length,
      });
      return Promise.resolve(
        uploadRecord({
          id: input.id,
          rows: input.records.length,
          comparison: input.comparison,
          flags: input.flags.length,
          issues: [...input.issues],
        }),
      );
    }),
    uploads: vi.fn(() => Promise.resolve({ items: [uploadRecord()], total: 1 })),
    upload: vi.fn(() => Promise.resolve(uploadRecord())),
    uploadFile: vi.fn(() =>
      Promise.resolve({
        objectKey: `group-uploads/${SUB_A}/${UPLOAD_ID}`,
        fileName: 'employees.csv',
        mediaType: 'text/csv',
      }),
    ),
    employees: vi.fn(() =>
      Promise.resolve({
        items: [snapshotRecord()],
        total: 1,
        departments: ['Finance'],
        entities: 2,
        entitiesWithData: 1,
        versions: 1,
        lastChange: null,
      }),
    ),
    history: vi.fn(() =>
      Promise.resolve({
        records: [
          {
            ...snapshotRecord({ grossSalary: '15000.00' }),
            uploadedByName: 'Alpha HR',
            uploadedAt: new Date('2026-10-05T06:00:00Z'),
          },
          {
            ...snapshotRecord({ id: RECORD_ID.replace('71', '72'), period: '2026-08' }),
            uploadedByName: 'Alpha HR',
            uploadedAt: new Date('2026-09-05T06:00:00Z'),
          },
        ],
      }),
    ),
    summaries: vi.fn(() => Promise.resolve([])),
    extract: vi.fn(() =>
      Promise.resolve([
        {
          record: snapshotRecord(),
          uploadedByName: 'Alpha HR',
          uploadedAt: new Date('2026-10-05T06:00:00Z'),
          fileName: 'employees.csv',
        },
      ]),
    ),
  };
}

const rule = (code: string, kind: string, threshold: string | null): RuleRecord => ({
  code,
  kind,
  threshold,
  enabled: true,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  updatedByName: null,
});

export const RULE_RECORDS: RuleRecord[] = [
  rule('ANM-01', 'missing_employee', null),
  rule('ANM-03', 'salary_change', '20'),
  rule('ANM-05', 'increment_mismatch', '1'),
];

/** A data quality repository with one open flag. */
export function workingDataQuality(): Mocked<DataQualityRepository> {
  return {
    rules: vi.fn(() => Promise.resolve(RULE_RECORDS)),
    updateRule: vi.fn(
      (_scope: Scope, code: string, input: { threshold: string | null; enabled: boolean }) =>
        Promise.resolve({ ...rule(code, 'salary_change', null), ...input }),
    ),
    approvedIncrements: vi.fn(() => Promise.resolve([])),
    flags: vi.fn(() =>
      Promise.resolve({
        items: [flagRecord()],
        total: 1,
        counts: { open: 1, in_progress: 0, resolved: 0 },
        oldestOpenAt: new Date('2026-10-05T06:00:00Z'),
      }),
    ),
    flagsByEntity: vi.fn(() =>
      Promise.resolve([
        { entity: { id: SUB_A, code: 'SUB-A' }, counts: { open: 1, in_progress: 0, resolved: 0 } },
      ]),
    ),
    variations: vi.fn(() =>
      Promise.resolve([
        {
          entity: { id: SUB_A, code: 'SUB-A' },
          period: '2026-09',
          upload: { id: UPLOAD_ID, reference: 'UP-0001', version: 1 },
          comparison: null,
          flags: 1,
        },
      ]),
    ),
    flag: vi.fn(() =>
      Promise.resolve({
        flag: flagRecord(),
        activity: [
          {
            action: 'anomaly_flag.raised',
            actorName: 'Alpha HR',
            at: new Date('2026-10-05T06:00:00Z'),
            details: { rule: 'ANM-03', nested: { no: 1 } },
          },
        ],
        previousId: null,
        nextId: null,
      }),
    ),
    owners: vi.fn(() => Promise.resolve([{ id: 'alpha', name: 'Alpha HR' }])),
    updateFlag: vi.fn(
      (
        _scope: Scope,
        _id: string,
        input: {
          owner: { id: string; name: string } | null;
          status: FlagRecord['status'];
          note: string | null;
          notifications: (context: FlagContext) => readonly NewNotification[];
        },
      ) => {
        const flag = flagRecord({
          status: input.status,
          note: input.note,
          ...(input.owner === null ? {} : { owner: input.owner }),
        });
        input.notifications({ flag });
        return Promise.resolve(flag);
      },
    ),
    remind: vi.fn(
      (
        _scope: Scope,
        _id: string,
        notifications: (context: FlagContext) => readonly NewNotification[],
      ) => {
        notifications({ flag: flagRecord() });
        return Promise.resolve();
      },
    ),
  };
}
