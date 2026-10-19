import type {
  AnomalyRule,
  EmployeeHistory,
  EmployeePage,
  EmployeeRecord,
  FieldTemplate,
  Flag,
  FlagDetail,
  FlagPage,
  Me,
  Upload,
  UploadDetail,
  UploadPage,
} from '@peopleforge/contracts';

/** Synthetic group data (R2) as the API returns it, for the web app's tests. */

export const SUB_A = '00000000-0000-4000-8000-0000000e000a';
export const SUB_B = '00000000-0000-4000-8000-0000000e000b';
export const UPLOAD_ID = '66666666-6666-4666-8666-666666666661';
export const RECORD_ID = '77777777-7777-4777-8777-777777777771';
export const FLAG_ID = '88888888-8888-4888-8888-888888888881';
export const FLAG_2 = '88888888-8888-4888-8888-888888888882';

const ENTITIES = [
  { id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } },
  { id: SUB_B, code: 'SUB-B', name: { en: 'Subsidiary B' } },
];

export const ALPHA_HR: Me = {
  userId: 'oid-alpha',
  username: 'pf.alpha.hr',
  name: 'Priya Nair',
  roles: ['PeopleForge.SubsidiaryHR'],
  scope: 'entity',
  permissions: [
    'employee_data:upload',
    'employee_data:read',
    'employee_data:read_compensation',
    'anomaly:resolve',
  ],
  entities: [ENTITIES[0] as Me['entities'][number]],
};

export const REVIEWER: Me = {
  userId: 'oid-reviewer',
  username: 'pf.reviewer',
  name: 'Sara Al Mansoori',
  roles: ['PeopleForge.Reviewer'],
  scope: 'group',
  permissions: [
    'employee_data:read',
    'employee_data:read_compensation',
    'employee_data:extract_raw',
    'anomaly:resolve',
  ],
  entities: ENTITIES,
};

export const ADMIN: Me = {
  ...REVIEWER,
  userId: 'oid-admin',
  name: 'Admin',
  roles: ['PeopleForge.Admin'],
  permissions: ['criteria:configure', 'template:configure'],
};

export const EXECUTIVE: Me = {
  ...REVIEWER,
  userId: 'oid-exec',
  roles: ['PeopleForge.Executive'],
  permissions: ['report:read_executive'],
};

export function fieldTemplate(overrides: Partial<FieldTemplate> = {}): FieldTemplate {
  return {
    id: '00000000-0000-4000-8000-0000000f7e01',
    version: 1,
    activatedAt: '2026-10-01T00:00:00.000Z',
    fields: [
      {
        key: 'employee_number',
        label: { en: 'Employee ID', ar: 'رقم الموظف' },
        type: 'text',
        required: true,
        core: true,
        allowedValues: [],
        palmHrField: null,
      },
      {
        key: 'grade',
        label: { en: 'Grade' },
        type: 'text',
        required: true,
        core: true,
        allowedValues: [],
        palmHrField: 'grade_code',
      },
      {
        key: 'gender',
        label: { en: 'Gender' },
        type: 'enum',
        required: true,
        core: true,
        allowedValues: ['female', 'male'],
        palmHrField: null,
      },
      {
        key: 'project',
        label: { en: 'Project' },
        type: 'text',
        required: false,
        core: false,
        allowedValues: [],
        palmHrField: null,
      },
    ],
    ...overrides,
  };
}

export const COMPARISON = {
  previousPeriod: '2026-08',
  headcount: 412,
  previousHeadcount: 405,
  payrollChangePercent: '2.7',
  newRecords: 9,
  left: 2,
  missing: 1,
  changed: 94,
  warnings: [],
};

export function upload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: UPLOAD_ID,
    reference: 'UP-0007',
    entity: { id: SUB_A, code: 'SUB-A' },
    period: '2026-09',
    version: 2,
    status: 'accepted',
    fileName: 'employees-sep.xlsx',
    rows: 412,
    errors: 0,
    warnings: 1,
    templateVersion: 1,
    uploadedByName: 'Priya Nair',
    uploadedAt: '2026-10-05T06:00:00.000Z',
    comparison: COMPARISON,
    flags: 3,
    ...overrides,
  };
}

export function uploadDetail(overrides: Partial<UploadDetail> = {}): UploadDetail {
  return {
    ...upload(),
    issues: [{ row: 1, field: null, code: 'unknown_column', severity: 'warning' }],
    issuesTotal: 1,
    ...overrides,
  };
}

export function uploadPage(items: Upload[] = [upload()], total = items.length): UploadPage {
  return { items, page: 1, pageSize: 10, total };
}

export function employeeRecord(overrides: Partial<EmployeeRecord> = {}): EmployeeRecord {
  return {
    id: RECORD_ID,
    entity: { id: SUB_A, code: 'SUB-A' },
    period: '2026-09',
    employeeNumber: 'EMP-1101',
    fullName: 'Aisha Rahman',
    department: 'Finance',
    designation: 'Analyst',
    grade: 'G5',
    grossSalary: '14200.00',
    currency: 'AED',
    dateJoined: '2020-01-15',
    dateOfBirth: '1990-05-01',
    gender: 'female',
    nationality: 'AE',
    status: 'active',
    dateLeft: null,
    costCentre: null,
    extra: {},
    upload: { id: UPLOAD_ID, reference: 'UP-0007', version: 2 },
    ...overrides,
  };
}

export function employeePage(
  items: EmployeeRecord[] = [employeeRecord()],
  overrides: Partial<EmployeePage> = {},
): EmployeePage {
  return {
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
    summary: {
      entities: 2,
      entitiesWithData: 1,
      versions: 2,
      lastChange: { at: '2026-10-05T06:00:00.000Z', entityCode: 'SUB-A', version: 2 },
    },
    departments: ['Finance'],
    ...overrides,
  };
}

export function employeeHistory(): EmployeeHistory {
  const versionOf = (version: number, period: string, salary: string) => ({
    period,
    upload: {
      id: UPLOAD_ID,
      reference: `UP-000${String(version)}`,
      version,
      status: version === 2 ? ('accepted' as const) : ('superseded' as const),
      uploadedByName: 'Priya Nair',
      uploadedAt: '2026-10-05T06:00:00.000Z',
    },
    record: employeeRecord({ grossSalary: salary, period }),
    changes: [] as EmployeeHistory['versions'][number]['changes'],
  });
  return {
    employeeNumber: 'EMP-1101',
    entity: { id: SUB_A, code: 'SUB-A' },
    versions: [
      {
        ...versionOf(2, '2026-09', '15000.00'),
        changes: [
          { field: 'gross_salary', before: '14200.00', after: '15000.00' },
          { field: 'project', before: null, after: 'P1' },
          { field: 'cost_centre', before: 'CC-10', after: null },
        ],
      },
      versionOf(1, '2026-09', '14200.00'),
      versionOf(1, '2026-08', '14200.00'),
    ],
  };
}

export function flag(overrides: Partial<Flag> = {}): Flag {
  return {
    id: FLAG_ID,
    reference: 'AN-0042',
    entity: { id: SUB_A, code: 'SUB-A' },
    period: '2026-09',
    upload: { id: UPLOAD_ID, reference: 'UP-0007' },
    ruleCode: 'ANM-05',
    ruleKind: 'increment_mismatch',
    employeeNumber: 'EMP-3318',
    employeeName: 'Hassan Ali',
    field: 'gross_salary',
    detail: {
      previous: '14200.00',
      current: '14700.00',
      expected: '14910.00',
      approvedPercent: '5.00',
    },
    owner: { id: 'oid-alpha', name: 'Priya Nair' },
    status: 'open',
    note: null,
    resolvedReason: null,
    createdAt: '2026-10-05T06:00:00.000Z',
    updatedAt: '2026-10-05T06:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

export function flagPage(items: Flag[] = [flag()], overrides: Partial<FlagPage> = {}): FlagPage {
  return {
    items,
    page: 1,
    pageSize: 10,
    total: items.length,
    counts: { open: 3, in_progress: 1, resolved: 5 },
    oldestOpenAt: '2026-10-05T06:00:00.000Z',
    rules: [
      { code: 'ANM-03', kind: 'salary_change' },
      { code: 'ANM-05', kind: 'increment_mismatch' },
    ],
    byEntity: [
      { entity: { id: SUB_A, code: 'SUB-A' }, counts: { open: 3, in_progress: 1, resolved: 5 } },
      { entity: { id: SUB_B, code: 'SUB-B' }, counts: { open: 0, in_progress: 0, resolved: 2 } },
    ],
    variations: [
      {
        entity: { id: SUB_A, code: 'SUB-A' },
        upload: { id: UPLOAD_ID, reference: 'UP-0007', version: 2 },
        comparison: COMPARISON,
        flags: 3,
      },
      {
        entity: { id: SUB_B, code: 'SUB-B' },
        upload: { id: UPLOAD_ID, reference: 'UP-0008', version: 1 },
        comparison: null,
        flags: 0,
      },
    ],
    ...overrides,
  };
}

export function flagDetail(overrides: Partial<FlagDetail> = {}): FlagDetail {
  return {
    flag: flag(),
    activity: [
      {
        action: 'anomaly_flag.raised',
        actorName: 'Priya Nair',
        at: '2026-10-05T06:00:00.000Z',
        details: { rule: 'ANM-05' },
      },
      {
        action: 'anomaly_flag.updated',
        actorName: null,
        at: '2026-10-06T06:00:00.000Z',
        details: { to: 'in_progress', owner: 'Priya Nair' },
      },
    ],
    previousId: null,
    nextId: FLAG_2,
    owners: [{ id: 'oid-alpha', name: 'Priya Nair' }],
    ...overrides,
  };
}

export function anomalyRules(): AnomalyRule[] {
  return [
    {
      code: 'ANM-01',
      kind: 'missing_employee',
      threshold: null,
      enabled: true,
      updatedAt: '2026-10-01T00:00:00.000Z',
      updatedByName: null,
    },
    {
      code: 'ANM-03',
      kind: 'salary_change',
      threshold: '20',
      enabled: true,
      updatedAt: '2026-10-10T00:00:00.000Z',
      updatedByName: 'Admin',
    },
    {
      code: 'ANM-04',
      kind: 'salary_stable_then_changed',
      threshold: '12',
      enabled: false,
      updatedAt: '2026-10-10T00:00:00.000Z',
      updatedByName: null,
    },
  ];
}
