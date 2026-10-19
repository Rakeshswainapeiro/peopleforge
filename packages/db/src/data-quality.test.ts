import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './database.js';
import {
  createDataQualityRepository,
  DataQualityError,
  type DataQualityRepository,
  type FlagContext,
} from './data-quality.js';
import {
  createGroupDataRepository,
  type FlagInput,
  type GroupDataRepository,
  type SnapshotInput,
} from './group-data.js';
import { createIncrementRequestRepository } from './increment-requests.js';
import type { NewNotification } from './notifications.js';
import { createReviewRepository } from './review.js';
import type { Scope } from './scope.js';
import { SEED_ASSIGNMENTS, SEED_ENTITIES } from './seed.js';
import { queueGroupReminders } from './settings.js';
import {
  resetCoreDatabase,
  TEST_APP_URL,
  TEST_OWNER_URL,
  TEST_WORKER_URL,
  testCipher,
} from './test-support/db.js';

// Data quality (R2-09 … R2-11, DASH-D7) against a real database: configurable rules, flags with
// owner, status and an encrypted resolution note, their activity, and isolation (RLS). Also the
// R1 approved increments R2 reads (ANM-05, DASH-D6).
const [SUB_A, SUB_B] = SEED_ENTITIES;
const CYCLE = '00000000-0000-4000-8000-00000000c026';
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
const reviewer: Scope = { userId: 'sirius-reviewer', userName: 'Sara Al Mansoori', kind: 'group' };

let handle: DatabaseHandle;
let groupData: GroupDataRepository;
let quality: DataQualityRepository;
const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
const flagIds: string[] = [];

async function asOwner<T extends pg.QueryResultRow>(
  statement: string,
  values: unknown[] = [],
  userId = '',
) {
  await owner.query('BEGIN');
  try {
    await owner.query("SELECT set_config('app.scope', 'group', true)");
    // Notifications are readable by their recipient only (RLS), the owner included.
    await owner.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await owner.query<T>(statement, values);
    await owner.query('COMMIT');
    return result.rows;
  } catch (error: unknown) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

async function refusal(promise: Promise<unknown>): Promise<DataQualityError> {
  const error: unknown = await promise.then(
    () => new Error('expected a refusal'),
    (reason: unknown) => reason,
  );
  if (!(error instanceof DataQualityError)) throw error;
  return error;
}

const record = (number: string): SnapshotInput => ({
  rowNumber: 2,
  employeeNumber: number,
  fullName: `Person ${number}`,
  department: 'Finance',
  designation: null,
  grade: 'G5',
  grossSalary: '14200.00',
  basicSalary: null,
  currency: 'AED',
  dateJoined: '2020-01-15',
  dateOfBirth: null,
  gender: 'male',
  nationality: null,
  status: 'active',
  dateLeft: null,
  costCentre: null,
  extra: {},
});

const flag = (ruleCode: string, employeeNumber: string | null): FlagInput => ({
  ruleCode,
  employeeNumber,
  employeeName: employeeNumber === null ? null : `Person ${employeeNumber}`,
  field: employeeNumber === null ? null : 'gross_salary',
  detail: { previous: '12000.00', current: '14200.00' },
});

async function acceptWithFlags(scope: Scope, entityId: string, period: string, flags: FlagInput[]) {
  const id = randomUUID();
  return groupData.accept(scope, {
    id,
    entityId,
    period,
    templateId: TEMPLATE_V1,
    file: {
      objectKey: `group-uploads/${id}`,
      fileName: 'employees.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 900,
      sha256: id.replaceAll('-', '').padEnd(64, '0'),
      scanEngine: 'test',
    },
    rows: 1,
    uploaderName: scope.userName ?? 'Uploader',
    issues: [],
    records: [record(entityId === SUB_A.id ? 'EMP-1101' : 'EMP-2201')],
    summary: [],
    comparison: { headcount: 1 },
    flags,
    notifications: () => [],
  });
}

const ownerNotice = (context: FlagContext): NewNotification[] => [
  {
    recipient: { userId: context.flag.owner.id },
    kind: 'flag_updated',
    entityId: context.flag.entity.id,
    requestId: null,
    params: { flag: context.flag.reference },
  },
];

/** A submitted request of Subsidiary A, one employee approved as proposed, one at 4.5%. */
async function approveIncrements() {
  const requests = createIncrementRequestRepository(handle.db, testCipher);
  const review = createReviewRepository(handle.db, testCipher);
  const employees = await asOwner<{ id: string }>(
    "SELECT id FROM core.employee WHERE employee_number IN ('EMP-1101', 'EMP-1102') ORDER BY employee_number",
  );
  const { id } = await requests.create(alpha, {
    entityId: SUB_A.id,
    cycleId: CYCLE,
    employeeIds: employees.map((row) => row.id),
    idempotencyKey: `key-${randomUUID()}`,
  });
  const draft = await requests.get(alpha, id);
  await requests.saveDraft(alpha, id, {
    version: 1,
    proposals: (draft?.lines ?? []).map((line) => ({
      lineId: line.id,
      kind: 'percent' as const,
      value: '5.00',
    })),
  });
  await requests.submit(alpha, id, {
    version: 2,
    idempotencyKey: `key-${randomUUID()}`,
    submitterName: 'Alpha HR Test',
    notifications: () => [],
  });
  const request = await requests.get(reviewer, id);
  const lines = (request?.lines ?? []).map((line) => line.id);
  for (const [index, lineId] of lines.entries()) {
    for (const criterion of request?.criteria ?? []) {
      await review.verify(reviewer, {
        requestId: id,
        lineId,
        criterionId: criterion.id,
        verified: true,
        actorName: 'Sara Al Mansoori',
        notifications: () => [],
      });
    }
    await review.decide(reviewer, {
      requestId: id,
      lineId,
      idempotencyKey: `key-${randomUUID()}`,
      decision: 'approved',
      reasonCode: null,
      comment: '',
      approved: index === 0 ? null : { kind: 'percent', value: '4.50' },
      actorName: 'Sara Al Mansoori',
      notifications: () => [],
    });
  }
}

beforeAll(async () => {
  await resetCoreDatabase();
  await owner.connect();
  handle = createDatabase({ connectionString: TEST_APP_URL, poolMax: 4 });
  groupData = createGroupDataRepository(handle.db, testCipher);
  quality = createDataQualityRepository(handle.db, testCipher);
  await approveIncrements();
  await acceptWithFlags(alpha, SUB_A.id, '2026-08', [
    flag('ANM-03', 'EMP-1101'),
    flag('ANM-06', 'EMP-1101'),
    flag('ANM-08', null),
  ]);
  await acceptWithFlags(beta, SUB_B.id, '2026-08', [flag('ANM-03', 'EMP-2201')]);
  const rows = await asOwner<{ id: string }>(
    'SELECT id FROM groupdata.anomaly_flag ORDER BY reference',
  );
  flagIds.push(...rows.map((row) => row.id));
});

afterAll(async () => {
  await handle.close();
  await owner.end();
});

describe('anomaly rules [R2-10, NFR-CFG-01]', () => {
  it('lists the nine configured rules', async () => {
    const rules = await quality.rules(alpha);
    expect(rules.map((rule) => rule.code)).toEqual([
      'ANM-01',
      'ANM-02',
      'ANM-03',
      'ANM-04',
      'ANM-05',
      'ANM-06',
      'ANM-07',
      'ANM-08',
      'ANM-09',
    ]);
    expect(rules[2]).toMatchObject({ kind: 'salary_change', threshold: '20', enabled: true });
  });

  it('lets Sirius change a threshold, audited, and refuses unknown rules and subsidiaries', async () => {
    const updated = await quality.updateRule(reviewer, 'ANM-03', {
      threshold: '25',
      enabled: false,
      actorName: 'Sara Al Mansoori',
    });
    expect(updated).toMatchObject({
      threshold: '25',
      enabled: false,
      updatedByName: 'Sara Al Mansoori',
    });
    const cleared = await quality.updateRule(reviewer, 'ANM-01', {
      threshold: null,
      enabled: true,
      actorName: 'Sara Al Mansoori',
    });
    expect(cleared.threshold).toBeNull();
    const [audit] = await asOwner<{ details: { threshold: string } }>(
      "SELECT details FROM audit.audit_log WHERE action = 'anomaly_rule.updated' AND subject_id = 'ANM-03'",
    );
    expect(audit?.details.threshold).toBe('25');
    expect(
      (
        await refusal(
          quality.updateRule(reviewer, 'ANM-99', {
            threshold: null,
            enabled: true,
            actorName: 'X',
          }),
        )
      ).reason,
    ).toBe('not_found');
    // A subsidiary's update matches no row (RLS): the rule is unchanged.
    await expect(
      quality.updateRule(alpha, 'ANM-03', { threshold: '1', enabled: true, actorName: 'X' }),
    ).rejects.toBeInstanceOf(DataQualityError);
    expect((await quality.rules(reviewer))[2]?.threshold).toBe('25');
  });
});

describe('flags [R2-10, R2-11, DASH-D7]', () => {
  it('lists flags with counts, filters and the oldest open one', async () => {
    const all = await quality.flags(reviewer, { limit: 10, offset: 0 });
    expect(all.total).toBe(4);
    expect(all.counts).toEqual({ open: 4, in_progress: 0, resolved: 0 });
    expect(all.oldestOpenAt).toBeInstanceOf(Date);
    expect(all.items[0]?.detail).toEqual({ previous: '12000.00', current: '14200.00' });

    const filtered = await quality.flags(reviewer, {
      period: '2026-08',
      entityId: SUB_A.id,
      status: 'open',
      ruleCode: 'ANM-03',
      limit: 10,
      offset: 0,
    });
    expect(
      filtered.items.map((item) => [item.ruleCode, item.ruleKind, item.employeeNumber]),
    ).toEqual([['ANM-03', 'salary_change', 'EMP-1101']]);
    // The cards count every status of the other filters.
    expect(filtered.counts.open).toBe(1);

    const mine = await quality.flags(beta, { limit: 10, offset: 0 });
    expect(mine.items.map((item) => item.entity.code)).toEqual([SUB_B.code]);
    const none = await quality.flags(beta, { period: '2026-01', limit: 10, offset: 0 });
    expect(none).toMatchObject({ total: 0, oldestOpenAt: null, items: [] });
  });

  it('counts flags per subsidiary and shows each subsidiary variations', async () => {
    const byEntity = await quality.flagsByEntity(reviewer, { period: '2026-08' });
    expect(byEntity).toEqual([
      {
        entity: { id: SUB_A.id, code: SUB_A.code },
        counts: { open: 3, in_progress: 0, resolved: 0 },
      },
      {
        entity: { id: SUB_B.id, code: SUB_B.code },
        counts: { open: 1, in_progress: 0, resolved: 0 },
      },
    ]);
    const variations = await quality.variations(reviewer, '2026-08');
    expect(variations.map((row) => [row.entity.code, row.upload.version, row.flags])).toEqual([
      [SUB_A.code, 1, 3],
      [SUB_B.code, 1, 1],
    ]);
    expect(variations[0]?.comparison).toEqual({ headcount: 1 });
    expect(await quality.variations(reviewer, '2026-08', SUB_B.id)).toHaveLength(1);
    expect(await quality.variations(alpha, '2026-08')).toHaveLength(1);
  });

  it('shows a flag with its activity and neighbours, never another subsidiary flag', async () => {
    const [first, second] = flagIds;
    const detail = await quality.flag(reviewer, second ?? '');
    expect(detail?.flag).toMatchObject({
      ruleCode: 'ANM-06',
      owner: { id: alpha.userId, name: 'Alpha HR Test' },
      status: 'open',
      note: null,
      resolvedReason: null,
    });
    expect(detail?.activity.map((entry) => entry.action)).toEqual(['anomaly_flag.raised']);
    expect(detail?.previousId).toBe(first);
    expect(detail?.nextId).toBe(flagIds[2]);
    const firstDetail = await quality.flag(reviewer, first ?? '');
    expect(firstDetail?.previousId).toBeNull();
    expect(await quality.flag(beta, first ?? '')).toBeNull();
    expect(await quality.flag(reviewer, randomUUID())).toBeNull();
  });

  it('offers the subsidiary uploaders and current owners as owners', async () => {
    expect(await quality.owners(reviewer, SUB_A.id)).toEqual([
      { id: alpha.userId, name: 'Alpha HR Test' },
    ]);
    expect(await quality.owners(beta, SUB_A.id)).toEqual([]);
  });

  it('assigns, progresses and resolves a flag with an encrypted note, audited', async () => {
    const id = flagIds[0] ?? '';
    const assigned = await quality.updateFlag(reviewer, id, {
      owner: { id: 'sirius-reviewer', name: 'Sara Al Mansoori' },
      status: 'in_progress',
      note: null,
      notifications: ownerNotice,
    });
    expect(assigned).toMatchObject({
      status: 'in_progress',
      owner: { name: 'Sara Al Mansoori' },
      resolvedAt: null,
    });
    expect(await quality.owners(reviewer, SUB_A.id)).toEqual([
      { id: alpha.userId, name: 'Alpha HR Test' },
      { id: 'sirius-reviewer', name: 'Sara Al Mansoori' },
    ]);

    const resolved = await quality.updateFlag(alpha, id, {
      owner: null,
      status: 'resolved',
      note: 'Promotion effective August; confirmed with payroll.',
      notifications: ownerNotice,
    });
    expect(resolved).toMatchObject({
      status: 'resolved',
      owner: { name: 'Sara Al Mansoori' },
      note: 'Promotion effective August; confirmed with payroll.',
    });
    expect(resolved.resolvedAt).toBeInstanceOf(Date);

    const [stored] = await asOwner<{ note: Buffer }>(
      'SELECT resolution_note AS note FROM groupdata.anomaly_flag WHERE id = $1',
      [id],
    );
    expect(stored?.note.toString('utf8')).not.toContain('Promotion');
    const audits = await asOwner<{ details: Record<string, unknown> }>(
      "SELECT details FROM audit.audit_log WHERE action = 'anomaly_flag.updated' AND subject_id = $1 ORDER BY id",
      [id],
    );
    expect(audits.map((row) => row.details)).toEqual([
      expect.objectContaining({
        from: 'open',
        to: 'in_progress',
        ownerChanged: true,
        note: false,
      }) as unknown,
      expect.objectContaining({
        from: 'in_progress',
        to: 'resolved',
        ownerChanged: false,
        note: true,
      }) as unknown,
    ]);
    expect(JSON.stringify(audits)).not.toContain('Promotion');
    const notices = await asOwner<{ n: number }>(
      "SELECT count(*)::int AS n FROM notify.notification WHERE kind = 'flag_updated'",
      [],
      'sirius-reviewer',
    );
    expect(notices).toEqual([{ n: 2 }]);
    const detail = await quality.flag(reviewer, id);
    expect(detail?.activity.map((entry) => entry.action)).toEqual([
      'anomaly_flag.raised',
      'anomaly_flag.updated',
      'anomaly_flag.updated',
    ]);
    expect((await quality.flags(reviewer, { limit: 10, offset: 0 })).counts).toEqual({
      open: 3,
      in_progress: 0,
      resolved: 1,
    });
  });

  it('refuses unknown, other subsidiaries and superseded flags', async () => {
    const update = { owner: null, status: 'open' as const, note: null, notifications: ownerNotice };
    expect((await refusal(quality.updateFlag(reviewer, randomUUID(), update))).reason).toBe(
      'not_found',
    );
    expect((await refusal(quality.updateFlag(beta, flagIds[1] ?? '', update))).reason).toBe(
      'not_found',
    );
    // A new version of Subsidiary B's month closes its flag as superseded.
    await acceptWithFlags(beta, SUB_B.id, '2026-08', []);
    expect((await refusal(quality.updateFlag(beta, flagIds[3] ?? '', update))).reason).toBe(
      'superseded',
    );
  });

  it('reminds the owner, audited, only for a visible flag', async () => {
    await quality.remind(reviewer, flagIds[1] ?? '', ownerNotice);
    const [audit] = await asOwner<{ details: { owner: string } }>(
      "SELECT details FROM audit.audit_log WHERE action = 'anomaly_flag.reminded'",
    );
    expect(audit?.details.owner).toBe('Alpha HR Test');
    expect((await refusal(quality.remind(beta, flagIds[1] ?? '', ownerNotice))).reason).toBe(
      'not_found',
    );
  });
});

describe('approved increments for R2 [ANM-05, DASH-D6]', () => {
  it('returns approved employees with the increment they were approved at', async () => {
    const all = await quality.approvedIncrements(reviewer, {});
    expect(
      all.map((row) => [row.employeeNumber, row.currentSalary, row.proposedValue, row.approved]),
    ).toEqual([
      ['EMP-1101', '14200.00', '5.00', null],
      ['EMP-1102', '16800.00', '5.00', { kind: 'percent', value: '4.50' }],
    ]);
    expect(all[0]).toMatchObject({ entityCode: SUB_A.code, cycleId: CYCLE, currency: 'AED' });
    expect(
      await quality.approvedIncrements(reviewer, {
        entityId: SUB_A.id,
        cycleId: CYCLE,
        before: new Date(),
      }),
    ).toHaveLength(2);
    expect(await quality.approvedIncrements(reviewer, { before: new Date('2000-01-01') })).toEqual(
      [],
    );
    expect(await quality.approvedIncrements(beta, {})).toEqual([]);
  });
});

describe('group-data reminders [R2-11]', () => {
  it('reminds a flag owner once after N days and missing uploads once per user', async () => {
    const worker = createDatabase({ connectionString: TEST_WORKER_URL, poolMax: 1 });
    try {
      // Last month has no uploads: both seeded subsidiary users are due once last month ended
      // five days ago (business time zone); the flags aren't old enough yet.
      const [now] = await asOwner<{ due: boolean }>(
        `SELECT (now() AT TIME ZONE 'Asia/Dubai')::date
                  >= date_trunc('month', now() AT TIME ZONE 'Asia/Dubai')::date + 5 AS due`,
      );
      expect(await queueGroupReminders(worker.db)).toBe(now?.due === true ? 2 : 0);
      await asOwner("UPDATE groupdata.anomaly_flag SET created_at = now() - interval '6 days'");
      // Flags 2 and 3 are open (1 resolved, 4 superseded).
      expect(await queueGroupReminders(worker.db)).toBe(2);
      expect(await queueGroupReminders(worker.db)).toBe(0);
      await asOwner(
        "UPDATE notify.reminder_rule SET enabled = false WHERE kind IN ('upload_due', 'flag_open')",
      );
      expect(await queueGroupReminders(worker.db)).toBe(0);
      const notices = await asOwner<{ kind: string; params: { flag?: string } }>(
        "SELECT kind, params FROM notify.notification WHERE kind = 'flag_open'",
        [],
        alpha.userId,
      );
      expect(notices).toHaveLength(2);
      // The worker can't read flags directly.
      await expect(
        worker.db
          .selectFrom('groupdata.anomaly_flag' as never)
          .selectAll()
          .execute(),
      ).rejects.toThrow();
    } finally {
      await worker.close();
    }
  });
});
