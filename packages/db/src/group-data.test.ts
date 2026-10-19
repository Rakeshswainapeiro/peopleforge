import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createGroupDataRepository,
  GroupDataError,
  MAX_STORED_ISSUES,
  only,
  type AcceptInput,
  type GroupDataRepository,
  type SnapshotInput,
  type UploadInput,
} from './group-data.js';
import type { Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { resetCoreDatabase, TEST_APP_URL, TEST_OWNER_URL, testCipher } from './test-support/db.js';

// Group-level employee data (R2-01 … R2-04, R2-08, R2-12, R2-13) against a real database:
// the template, uploads and versions, the records in use, the employee master, the extract,
// encryption at rest and isolation between subsidiaries (RLS).
const [SUB_A, SUB_B, SUB_C] = SEED_ENTITIES;
const TEMPLATE_V1 = '00000000-0000-4000-8000-0000000f7e01';
const alpha: Scope = {
  userId: SEED_ASSIGNMENTS[0].userId,
  userName: 'Alpha HR Test',
  kind: 'entity',
  entityIds: [SUB_A.id],
};
const beta: Scope = {
  userId: SEED_ASSIGNMENTS[1].userId,
  userName: 'Beta HR Test',
  kind: 'entity',
  entityIds: [SUB_B.id],
};
const admin: Scope = { userId: 'admin-1', userName: 'Admin Test', kind: 'group' };

let handle: DatabaseHandle;
let repo: GroupDataRepository;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });

async function asOwner<T extends pg.QueryResultRow>(statement: string, values: unknown[] = []) {
  await owner.query('BEGIN');
  try {
    await owner.query("SELECT set_config('app.scope', 'group', true)");
    const result = await owner.query<T>(statement, values);
    await owner.query('COMMIT');
    return result.rows;
  } catch (error: unknown) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

async function refusal(promise: Promise<unknown>): Promise<GroupDataError> {
  const error: unknown = await promise.then(
    () => new Error('expected a refusal'),
    (reason: unknown) => reason,
  );
  if (!(error instanceof GroupDataError)) throw error;
  return error;
}

function record(rowNumber: number, overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    rowNumber,
    employeeNumber: `EMP-${String(1100 + rowNumber)}`,
    fullName: `Person ${String(rowNumber)}`,
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

function upload(entityId: string, period: string, rows: number): UploadInput {
  const id = randomUUID();
  // A different file each time (the same file as the version in use is refused).
  const sha256 = id.replaceAll('-', '').padEnd(64, '0');
  return {
    id,
    entityId,
    period,
    templateId: TEMPLATE_V1,
    file: {
      objectKey: `group-uploads/${id}`,
      fileName: 'employees.csv',
      mediaType: 'text/csv',
      sizeBytes: 1200,
      sha256,
      scanEngine: 'test',
    },
    rows,
    uploaderName: 'Alpha HR Test',
    issues: [],
  };
}

function accepted(
  entityId: string,
  period: string,
  records: readonly SnapshotInput[],
  extra: Partial<AcceptInput> = {},
): AcceptInput {
  return {
    ...upload(entityId, period, records.length),
    records,
    summary: [{ department: 'Finance', metrics: { headcount: records.length } }],
    comparison: { headcount: records.length },
    flags: [],
    notifications: (context) => [
      {
        recipient: { role: 'PeopleForge.Reviewer' },
        kind: 'group_upload_accepted',
        entityId: context.entityId,
        requestId: null,
        params: { reference: context.reference, entity: context.entityCode, flags: context.flags },
      },
    ],
    ...extra,
  };
}

beforeAll(async () => {
  await resetCoreDatabase();
  await owner.connect();
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 4 });
  repo = createGroupDataRepository(handle.db, testCipher);
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('only', () => {
  it('returns the single row and refuses none', () => {
    expect(only({ rows: [1] })).toBe(1);
    expect(() => only({ rows: [] })).toThrow('Expected a row');
  });
});

describe('field template [R2-01, NFR-CFG-01]', () => {
  it('serves the placeholder template to every user', async () => {
    const template = await repo.activeTemplate(alpha);
    expect(template).toMatchObject({ id: TEMPLATE_V1, version: 1 });
    expect(template.fields.map((field) => field.key)).toContain('gross_salary');
    expect(template.fields.every((field) => field.core)).toBe(true);
  });

  it('publishes a new version, keeping core flags, and refuses a stale version', async () => {
    const current = await repo.activeTemplate(admin);
    const fields = [
      ...current.fields.map(({ core: _core, ...field }) => field),
      {
        key: 'band_note',
        label: { en: 'Band note', ar: 'ملاحظة' },
        type: 'text' as const,
        required: false,
        allowedValues: [],
        palmHrField: null,
      },
      {
        key: 'project',
        label: { en: 'Project' },
        type: 'text' as const,
        required: false,
        allowedValues: [],
        palmHrField: 'project_code',
      },
    ];
    const published = await repo.publishTemplate(admin, { version: 1, fields });
    expect(published.version).toBe(2);
    expect(published.fields.find((field) => field.key === 'band_note')).toMatchObject({
      core: false,
      label: { en: 'Band note', ar: 'ملاحظة' },
    });
    expect(published.fields.find((field) => field.key === 'project')?.label).toEqual({
      en: 'Project',
    });
    expect(published.fields.find((field) => field.key === 'gross_salary')?.core).toBe(true);
    expect((await refusal(repo.publishTemplate(admin, { version: 1, fields }))).reason).toBe(
      'version_conflict',
    );
    const [audit] = await asOwner<{ details: { version: number } }>(
      "SELECT details FROM audit.audit_log WHERE action = 'field_template.published'",
    );
    expect(audit?.details.version).toBe(2);
  });

  it('lets only Sirius change it (RLS / grants)', async () => {
    const current = await repo.activeTemplate(alpha);
    await expect(
      repo.publishTemplate(alpha, {
        version: current.version,
        fields: current.fields.map(({ core: _core, ...field }) => field),
      }),
    ).rejects.toThrow();
  });

  it('lists the grade bands', async () => {
    const bands = await repo.gradeBands(alpha);
    expect(bands[0]).toMatchObject({ grade: 'G1', currency: 'AED' });
    expect(bands).toHaveLength(7);
  });
});

describe('uploads and versions [R2-02, R2-03, R2-04]', () => {
  it('records a rejected file without touching the data in use', async () => {
    const issues = Array.from({ length: MAX_STORED_ISSUES + 5 }, (_, index) => ({
      row: index + 2,
      field: 'grade',
      code: 'required',
      severity: 'error' as const,
    }));
    const rejected = await repo.recordRejected(alpha, {
      ...upload(SUB_A.id, '2026-07', 3),
      issues: [...issues, { row: 1, field: null, code: 'unknown_column', severity: 'warning' }],
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      version: null,
      errors: MAX_STORED_ISSUES + 5,
      warnings: 1,
      templateVersion: 1,
      entity: { code: SUB_A.code },
    });
    expect(rejected.reference).toMatch(/^UP-\d{4}$/u);
    expect(rejected.issues).toHaveLength(MAX_STORED_ISSUES);
    expect(await repo.recordsInUse(alpha, SUB_A.id, '2026-07')).toEqual([]);
  });

  it('accepts version 1, stores encrypted salaries and refreshes the employee master', async () => {
    const records = [
      record(2, { employeeNumber: 'EMP-1101', fullName: 'Aisha Rahman', grossSalary: '15000.00' }),
      record(3, { employeeNumber: 'EMP-1199', fullName: 'New Joiner', basicSalary: null }),
      record(4, {
        employeeNumber: 'EMP-1198',
        status: 'left',
        dateLeft: '2026-07-20',
        extra: { project: 'P1' },
      }),
    ];
    const first = await repo.accept(alpha, accepted(SUB_A.id, '2026-07', records));
    expect(first).toMatchObject({ status: 'accepted', version: 1, flags: 0, rows: 3 });

    const inUse = await repo.recordsInUse(alpha, SUB_A.id, '2026-07');
    expect(inUse.map((row) => [row.employeeNumber, row.grossSalary, row.basicSalary])).toEqual([
      ['EMP-1101', '15000.00', '9000.00'],
      ['EMP-1199', '14200.00', null],
      ['EMP-1198', '14200.00', '9000.00'],
    ]);
    expect(inUse[2]).toMatchObject({
      dateLeft: '2026-07-20',
      extra: { project: 'P1' },
      period: '2026-07',
    });

    const [stored] = await asOwner<{ gross: Buffer }>(
      "SELECT gross_salary AS gross FROM groupdata.employee_snapshot WHERE employee_number = 'EMP-1101'",
    );
    expect(stored?.gross.toString('utf8')).not.toContain('15000');

    const master = await asOwner<{ employee_number: string; active: boolean; full_name: string }>(
      `SELECT employee_number, active, full_name FROM core.employee
        WHERE entity_id = $1 ORDER BY employee_number`,
      [SUB_A.id],
    );
    expect(master).toEqual([
      { employee_number: 'EMP-1101', active: true, full_name: 'Aisha Rahman' },
      { employee_number: 'EMP-1102', active: false, full_name: 'Yusuf Karim' },
      { employee_number: 'EMP-1103', active: false, full_name: 'Mariam Saleh' },
      { employee_number: 'EMP-1198', active: false, full_name: 'Person 4' },
      { employee_number: 'EMP-1199', active: true, full_name: 'New Joiner' },
    ]);

    const notices = await asOwner<{ kind: string; params: { flags: number } }>(
      "SELECT kind, params FROM notify.notification WHERE kind = 'group_upload_accepted'",
    );
    expect(notices).toEqual([
      { kind: 'group_upload_accepted', params: expect.objectContaining({ flags: 0 }) as unknown },
    ]);
  });

  it('accepts version 2, supersedes version 1 and closes its open flags', async () => {
    const flagged = await repo.accept(
      alpha,
      accepted(SUB_A.id, '2026-08', [record(2, { employeeNumber: 'EMP-1101' })], {
        flags: [
          {
            ruleCode: 'ANM-03',
            employeeNumber: 'EMP-1101',
            employeeName: 'Aisha Rahman',
            field: 'gross_salary',
            detail: { previous: '15000.00', current: '14200.00' },
          },
        ],
      }),
    );
    expect(flagged).toMatchObject({ version: 1, flags: 1 });
    const raised = await asOwner<{ subject_id: string }>(
      "SELECT subject_id FROM audit.audit_log WHERE action = 'anomaly_flag.raised'",
    );
    expect(raised).toHaveLength(1);

    const second = await repo.accept(
      alpha,
      accepted(
        SUB_A.id,
        '2026-08',
        [record(2, { employeeNumber: 'EMP-1101', grossSalary: '15000.00' })],
        {
          summary: [],
          comparison: null,
        },
      ),
    );
    expect(second).toMatchObject({ version: 2, comparison: null });
    expect((await repo.upload(alpha, flagged.id))?.status).toBe('superseded');
    const flags = await asOwner<{ status: string; resolved_reason: string }>(
      'SELECT status, resolved_reason FROM groupdata.anomaly_flag WHERE upload_id = $1',
      [flagged.id],
    );
    expect(flags).toEqual([{ status: 'resolved', resolved_reason: 'superseded' }]);
    const summaries = await asOwner<{ n: number }>(
      "SELECT count(*)::int AS n FROM groupdata.period_summary WHERE period = '2026-08-01'",
    );
    expect(summaries).toEqual([{ n: 0 }]);
    const [audit] = await asOwner<{ details: { replaced: string } }>(
      "SELECT details FROM audit.audit_log WHERE action = 'group_upload.accepted' AND subject_id = $1",
      [second.id],
    );
    expect(audit?.details.replaced).toBe(flagged.id);
  });

  it('refuses the same file as the version in use', async () => {
    const [inUse] = (
      await repo.uploads(alpha, { entityId: SUB_A.id, period: '2026-08', limit: 1, offset: 0 })
    ).items;
    const [row] = await asOwner<{ sha256: string }>(
      'SELECT sha256 FROM groupdata.upload WHERE id = $1',
      [inUse?.id],
    );
    const again = accepted(SUB_A.id, '2026-08', [record(2)]);
    const error = await refusal(
      repo.accept(alpha, { ...again, file: { ...again.file, sha256: row?.sha256 ?? '' } }),
    );
    expect(error.reason).toBe('duplicate_file');
  });

  it('does not let an older month overwrite the employee master', async () => {
    await repo.accept(
      alpha,
      accepted(SUB_A.id, '2026-06', [
        record(2, { employeeNumber: 'EMP-1101', fullName: 'Old Name' }),
      ]),
    );
    const [master] = await asOwner<{ full_name: string }>(
      "SELECT full_name FROM core.employee WHERE employee_number = 'EMP-1101'",
    );
    expect(master?.full_name).toBe('Person 2');
  });

  it('stores large files in batches', async () => {
    const many = Array.from({ length: 501 }, (_, index) =>
      record(index + 2, { employeeNumber: `EMP-C${String(index)}` }),
    );
    const result = await repo.accept(admin, accepted(SUB_C.id, '2026-08', many));
    expect(result.rows).toBe(501);
    expect(await repo.recordsInUse(admin, SUB_C.id, '2026-08')).toHaveLength(501);
  });

  it('answers the previous month, salary history and IDs used elsewhere', async () => {
    expect(await repo.previousPeriod(alpha, SUB_A.id, '2026-08')).toBe('2026-07');
    expect(await repo.previousPeriod(alpha, SUB_A.id, '2026-06')).toBeNull();
    const history = await repo.salaryHistory(alpha, SUB_A.id, '2026-06', '2026-08');
    expect(history.filter((row) => row.employeeNumber === 'EMP-1101')).toEqual([
      { employeeNumber: 'EMP-1101', period: '2026-06', grossSalary: '14200.00' },
      { employeeNumber: 'EMP-1101', period: '2026-07', grossSalary: '15000.00' },
      { employeeNumber: 'EMP-1101', period: '2026-08', grossSalary: '15000.00' },
    ]);
    // Beta can't read Subsidiary C's records, but learns which of its IDs are in use there.
    expect(await repo.numbersElsewhere(beta, SUB_B.id, '2026-08', ['EMP-C1', 'EMP-X'])).toEqual([
      'EMP-C1',
    ]);
    expect(await repo.recordsInUse(beta, SUB_C.id, '2026-08')).toEqual([]);
    // The function puts the caller's scope back.
    expect((await repo.uploads(beta, { limit: 50, offset: 0 })).total).toBe(0);
  });

  it('lists uploads by subsidiary and month, isolated per subsidiary (R2-12)', async () => {
    const all = await repo.uploads(admin, { limit: 50, offset: 0 });
    expect(all.total).toBe(6);
    const mine = await repo.uploads(alpha, { limit: 50, offset: 0 });
    expect(mine.items.every((item) => item.entity.id === SUB_A.id)).toBe(true);
    expect(mine.total).toBe(5);
    const july = await repo.uploads(admin, {
      entityId: SUB_A.id,
      period: '2026-07',
      limit: 1,
      offset: 0,
    });
    expect(july.total).toBe(2);
    expect(july.items).toHaveLength(1);
    expect(await repo.upload(beta, mine.items[0]?.id ?? '')).toBeNull();
    expect(await repo.upload(admin, randomUUID())).toBeNull();
  });

  it('refuses an upload for another subsidiary', async () => {
    await expect(repo.accept(beta, accepted(SUB_A.id, '2026-09', [record(2)]))).rejects.toThrow();
    await expect(repo.recordRejected(beta, upload(SUB_A.id, '2026-09', 1))).rejects.toThrow();
  });

  it('audits downloading a file and hides other subsidiaries files', async () => {
    const [first] = (await repo.uploads(alpha, { limit: 1, offset: 0 })).items;
    const id = first?.id ?? '';
    expect(await repo.uploadFile(beta, id)).toBeNull();
    expect(await repo.uploadFile(alpha, id)).toEqual({
      objectKey: `group-uploads/${id}`,
      fileName: 'employees.csv',
      mediaType: 'text/csv',
    });
    const audits = await asOwner<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit.audit_log WHERE action = 'group_upload.downloaded'",
    );
    expect(audits).toEqual([{ n: 1 }]);
  });

  it('never lets a stored record change', async () => {
    await expect(
      asOwner(
        "UPDATE groupdata.employee_snapshot SET full_name = 'X' WHERE employee_number = 'EMP-1101'",
      ),
    ).rejects.toThrow();
  });
});

describe('employee records [R2-04, R2-05]', () => {
  it('pages the records in use with filters, departments and counts', async () => {
    const page = await repo.employees(admin, { period: '2026-08', limit: 10, offset: 0 });
    expect(page.total).toBe(502);
    expect(page.items).toHaveLength(10);
    expect(page.departments).toEqual(['Finance']);
    expect(page).toMatchObject({ entities: 3, entitiesWithData: 2, versions: 3 });
    expect(page.lastChange).toMatchObject({ entityCode: SUB_C.code, version: 1 });

    const filtered = await repo.employees(admin, {
      period: '2026-08',
      entityId: SUB_A.id,
      department: 'Finance',
      search: 'emp-1101',
      limit: 10,
      offset: 0,
    });
    expect(filtered.items.map((item) => [item.employeeNumber, item.upload.version])).toEqual([
      ['EMP-1101', 2],
    ]);
    expect(filtered).toMatchObject({ entities: 1, entitiesWithData: 1, versions: 2 });

    // LIKE wildcards in the search are literal.
    expect(
      (await repo.employees(admin, { period: '2026-08', search: '%', limit: 10, offset: 0 })).total,
    ).toBe(0);
  });

  it('shows a subsidiary only its own records and an empty month as empty', async () => {
    const page = await repo.employees(beta, { period: '2026-08', limit: 10, offset: 0 });
    expect(page).toMatchObject({
      total: 0,
      entitiesWithData: 0,
      lastChange: null,
      departments: [],
    });
  });

  it('returns one employee across months and versions, newest first', async () => {
    const [current] = (
      await repo.employees(alpha, { period: '2026-08', search: 'EMP-1101', limit: 1, offset: 0 })
    ).items;
    const history = await repo.history(alpha, current?.id ?? '');
    expect(history?.records.map((row) => [row.period, row.upload.version])).toEqual([
      ['2026-08', 2],
      ['2026-08', 1],
      ['2026-07', 1],
      ['2026-06', 1],
    ]);
    expect(history?.records[0]?.uploadedByName).toBe('Alpha HR Test');
    expect(await repo.history(beta, current?.id ?? '')).toBeNull();
  });
});

describe('raw extract [R2-08, RP-08]', () => {
  it('extracts the version in use, or every version, and audits it', async () => {
    const inUse = await repo.extract(
      admin,
      { period: '2026-08', entityId: SUB_A.id, allVersions: false },
      'xlsx',
    );
    expect(inUse.map((row) => row.record.upload.version)).toEqual([2]);
    expect(inUse[0]).toMatchObject({ fileName: 'employees.csv', uploadedByName: 'Alpha HR Test' });
    const all = await repo.extract(admin, { period: '2026-08', allVersions: true }, 'csv');
    expect(all).toHaveLength(503);
    const audits = await asOwner<{
      entity_id: string | null;
      details: { format: string; rows: number };
    }>(
      "SELECT entity_id, details FROM audit.audit_log WHERE action = 'group_data.extracted' ORDER BY id",
    );
    expect(audits).toEqual([
      {
        entity_id: SUB_A.id,
        details: expect.objectContaining({ format: 'xlsx', rows: 1 }) as unknown,
      },
      {
        entity_id: null,
        details: expect.objectContaining({ format: 'csv', rows: 503 }) as unknown,
      },
    ]);
  });

  it('extracts only the subsidiary own rows for a subsidiary user', async () => {
    const rows = await repo.extract(beta, { period: '2026-08', allVersions: true }, 'csv');
    expect(rows).toEqual([]);
  });
});
