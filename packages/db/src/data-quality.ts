import { sql, type Kysely } from 'kysely';
import {
  loadApprovedIncrements,
  type ApprovedIncrementFilter,
  type ApprovedIncrementRecord,
} from './approved-increments.js';
import { recordAudit } from './audit.js';
import { FLAG_DETAIL, FLAG_NOTE } from './encrypted-fields.js';
import type { FieldCipher } from './field-crypto.js';
import { only } from './group-data.js';
import { insertNotifications, type NewNotification } from './notifications.js';
import type { Database } from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Data quality (R2-09 … R2-11, DASH-D7): the anomaly rules (configuration), the flags raised
 * on accepted uploads, and their owner, status and resolution. Flag values and notes can be pay,
 * so they are encrypted (ADR-008). Row-Level Security keeps a subsidiary to its own flags.
 */

export type FlagStatus = 'open' | 'in_progress' | 'resolved';

export interface RuleRecord {
  code: string;
  kind: string;
  threshold: string | null;
  enabled: boolean;
  updatedAt: Date;
  updatedByName: string | null;
}

export interface FlagRecord {
  id: string;
  reference: string;
  entity: { id: string; code: string };
  period: string;
  upload: { id: string; reference: string };
  ruleCode: string;
  ruleKind: string;
  employeeNumber: string | null;
  employeeName: string | null;
  field: string | null;
  detail: Record<string, string>;
  owner: { id: string; name: string };
  status: FlagStatus;
  note: string | null;
  resolvedReason: 'superseded' | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface FlagFilter {
  period?: string | undefined;
  entityId?: string | undefined;
  status?: FlagStatus | undefined;
  ruleCode?: string | undefined;
}

export interface VariationRecord {
  entity: { id: string; code: string };
  period: string;
  upload: { id: string; reference: string; version: number };
  comparison: Record<string, unknown> | null;
  flags: number;
}

export interface FlagActivity {
  action: string;
  actorName: string | null;
  at: Date;
  details: Record<string, unknown>;
}

export interface FlagContext {
  flag: FlagRecord;
}

export interface DataQualityRepository {
  rules: (scope: Scope) => Promise<RuleRecord[]>;
  updateRule: (
    scope: Scope,
    code: string,
    input: { threshold: string | null; enabled: boolean; actorName: string },
  ) => Promise<RuleRecord>;
  approvedIncrements: (
    scope: Scope,
    filter: ApprovedIncrementFilter,
  ) => Promise<ApprovedIncrementRecord[]>;
  flags: (
    scope: Scope,
    filter: FlagFilter & { limit: number; offset: number },
  ) => Promise<{
    items: FlagRecord[];
    total: number;
    counts: Record<FlagStatus, number>;
    oldestOpenAt: Date | null;
  }>;
  /** Flags per subsidiary and status for a month (D7 bars). */
  flagsByEntity: (
    scope: Scope,
    filter: FlagFilter,
  ) => Promise<{ entity: { id: string; code: string }; counts: Record<FlagStatus, number> }[]>;
  /** Each subsidiary's version in use for the month and its comparison (D7 table). */
  variations: (scope: Scope, period: string, entityId?: string) => Promise<VariationRecord[]>;
  flag: (
    scope: Scope,
    id: string,
  ) => Promise<{
    flag: FlagRecord;
    activity: FlagActivity[];
    previousId: string | null;
    nextId: string | null;
  } | null>;
  /** People who can own a subsidiary's flags: those who uploaded its data, and the current owner. */
  owners: (scope: Scope, entityId: string) => Promise<{ id: string; name: string }[]>;
  updateFlag: (
    scope: Scope,
    id: string,
    input: {
      owner: { id: string; name: string } | null;
      status: FlagStatus;
      note: string | null;
      notifications: (context: FlagContext) => readonly NewNotification[];
    },
  ) => Promise<FlagRecord>;
  remind: (
    scope: Scope,
    id: string,
    notifications: (context: FlagContext) => readonly NewNotification[],
  ) => Promise<void>;
}

interface FlagRow {
  id: string;
  reference: string;
  entity_id: string;
  entity_code: string;
  period: string;
  upload_id: string;
  upload_reference: string;
  rule_code: string;
  rule_kind: string;
  employee_number: string | null;
  employee_name: string | null;
  field: string | null;
  detail: Buffer;
  owner_id: string;
  owner_name: string;
  status: FlagStatus;
  resolution_note: Buffer | null;
  resolved_reason: 'superseded' | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

const FLAG_COLUMNS = sql`f.id, f.reference, f.entity_id, e.code AS entity_code,
  to_char(f.period, 'YYYY-MM') AS period, f.upload_id, u.reference AS upload_reference,
  f.rule_code, r.kind AS rule_kind, f.employee_number, f.employee_name, f.field, f.detail,
  f.owner_id, f.owner_name, f.status, f.resolution_note, f.resolved_reason, f.created_at,
  f.updated_at, f.resolved_at`;

const FLAG_FROM = sql`groupdata.anomaly_flag f
  JOIN core.entity e ON e.id = f.entity_id
  JOIN groupdata.upload u ON u.id = f.upload_id
  JOIN groupdata.anomaly_rule r ON r.code = f.rule_code`;

function conditionsOf(filter: FlagFilter) {
  const conditions = [sql<boolean>`true`];
  if (filter.period !== undefined)
    conditions.push(sql<boolean>`f.period = ${`${filter.period}-01`}::date`);
  if (filter.entityId !== undefined)
    conditions.push(sql<boolean>`f.entity_id = ${filter.entityId}`);
  if (filter.status !== undefined) conditions.push(sql<boolean>`f.status = ${filter.status}`);
  if (filter.ruleCode !== undefined)
    conditions.push(sql<boolean>`f.rule_code = ${filter.ruleCode}`);
  return sql.join(conditions, sql` AND `);
}

const toCounts = (
  rows: readonly { status: FlagStatus; n: number }[],
): Record<FlagStatus, number> => {
  const counts = { open: 0, in_progress: 0, resolved: 0 };
  for (const row of rows) counts[row.status] = row.n;
  return counts;
};

export function createDataQualityRepository(
  db: Kysely<Database>,
  cipher: FieldCipher,
): DataQualityRepository {
  const toFlag = (row: FlagRow): FlagRecord => ({
    id: row.id,
    reference: row.reference,
    entity: { id: row.entity_id, code: row.entity_code },
    period: row.period,
    upload: { id: row.upload_id, reference: row.upload_reference },
    ruleCode: row.rule_code,
    ruleKind: row.rule_kind,
    employeeNumber: row.employee_number,
    employeeName: row.employee_name,
    field: row.field,
    detail: JSON.parse(cipher.decrypt(row.detail, { ...FLAG_DETAIL, rowId: row.id })) as Record<
      string,
      string
    >,
    owner: { id: row.owner_id, name: row.owner_name },
    status: row.status,
    note:
      row.resolution_note === null
        ? null
        : cipher.decrypt(row.resolution_note, { ...FLAG_NOTE, rowId: row.id }),
    resolvedReason: row.resolved_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  });

  const ruleRow = sql`code, kind, trim_scale(threshold)::text AS threshold, enabled, updated_at, updated_by_name`;
  const toRule = (row: {
    code: string;
    kind: string;
    threshold: string | null;
    enabled: boolean;
    updated_at: Date;
    updated_by_name: string | null;
  }): RuleRecord => ({
    code: row.code,
    kind: row.kind,
    threshold: row.threshold,
    enabled: row.enabled,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  });

  return {
    rules: (scope) =>
      withScope(db, scope, async (trx) => {
        const rows = await sql<Parameters<typeof toRule>[0]>`
          SELECT ${ruleRow} FROM groupdata.anomaly_rule ORDER BY code`.execute(trx);
        return rows.rows.map(toRule);
      }),

    updateRule: (scope, code, input) =>
      withScope(db, scope, async (trx) => {
        const rows = await sql<Parameters<typeof toRule>[0]>`
          UPDATE groupdata.anomaly_rule
             SET threshold = ${input.threshold}::numeric, enabled = ${input.enabled}, updated_at = now(),
                 updated_by = ${scope.userId}, updated_by_name = ${input.actorName}
           WHERE code = ${code}
          RETURNING ${ruleRow}`.execute(trx);
        const [row] = rows.rows;
        if (row === undefined) return null;
        await recordAudit(trx, scope.userId, {
          action: 'anomaly_rule.updated',
          entityId: null,
          subjectType: 'anomaly_rule',
          subjectId: code,
          details: { threshold: input.threshold, enabled: input.enabled },
        });
        return toRule(row);
      }).then((rule) => {
        if (rule === null) throw new DataQualityError('not_found');
        return rule;
      }),

    approvedIncrements: (scope, filter) =>
      withScope(db, scope, (trx) => loadApprovedIncrements(trx, cipher, filter)),

    flags: (scope, filter) =>
      withScope(db, scope, async (trx) => {
        const where = conditionsOf(filter);
        // The cards count every status for the other filters (not the status filter itself).
        const countWhere = conditionsOf({ ...filter, status: undefined });
        const counts = await sql<{ status: FlagStatus; n: number }>`
          SELECT f.status, count(*)::int AS n FROM ${FLAG_FROM} WHERE ${countWhere}
           GROUP BY f.status`.execute(trx);
        const oldest = await sql<{ at: Date | null }>`
          SELECT min(f.created_at) AS at FROM ${FLAG_FROM}
           WHERE ${countWhere} AND f.status <> 'resolved'`.execute(trx);
        const total = await sql<{
          n: number;
        }>`SELECT count(*)::int AS n FROM ${FLAG_FROM} WHERE ${where}`.execute(trx);
        const rows = await sql<FlagRow>`
          SELECT ${FLAG_COLUMNS} FROM ${FLAG_FROM} WHERE ${where}
           ORDER BY (f.status = 'resolved'), f.created_at DESC, f.reference DESC
           LIMIT ${filter.limit} OFFSET ${filter.offset}`.execute(trx);
        return {
          items: rows.rows.map(toFlag),
          total: only(total).n,
          counts: toCounts(counts.rows),
          oldestOpenAt: only(oldest).at,
        };
      }),

    flagsByEntity: (scope, filter) =>
      withScope(db, scope, async (trx) => {
        const rows = await sql<{ entity_id: string; code: string; status: FlagStatus; n: number }>`
          SELECT f.entity_id, e.code, f.status, count(*)::int AS n FROM ${FLAG_FROM}
           WHERE ${conditionsOf(filter)} GROUP BY f.entity_id, e.code, f.status ORDER BY e.code`.execute(
          trx,
        );
        const byEntity = new Map<
          string,
          { entity: { id: string; code: string }; rows: { status: FlagStatus; n: number }[] }
        >();
        for (const row of rows.rows) {
          const entry = byEntity.get(row.entity_id) ?? {
            entity: { id: row.entity_id, code: row.code },
            rows: [],
          };
          entry.rows.push({ status: row.status, n: row.n });
          byEntity.set(row.entity_id, entry);
        }
        return [...byEntity.values()].map((entry) => ({
          entity: entry.entity,
          counts: toCounts(entry.rows),
        }));
      }),

    variations: (scope, period, entityId) =>
      withScope(db, scope, async (trx) => {
        const rows = await sql<{
          entity_id: string;
          code: string;
          upload_id: string;
          reference: string;
          version: number;
          comparison: Record<string, unknown> | null;
          flags: number;
        }>`
          SELECT v.entity_id, e.code, u.id AS upload_id, u.reference, v.version, u.comparison,
                 (SELECT count(*)::int FROM groupdata.anomaly_flag f
                   WHERE f.upload_id = u.id) AS flags
            FROM groupdata.period_version v
            JOIN groupdata.upload u ON u.id = v.upload_id
            JOIN core.entity e ON e.id = v.entity_id
           WHERE v.period = ${`${period}-01`}::date
             ${entityId === undefined ? sql`` : sql`AND v.entity_id = ${entityId}`}
           ORDER BY e.code`.execute(trx);
        return rows.rows.map((row) => ({
          entity: { id: row.entity_id, code: row.code },
          period,
          upload: { id: row.upload_id, reference: row.reference, version: row.version },
          comparison: row.comparison,
          flags: row.flags,
        }));
      }),

    flag: (scope, id) =>
      withScope(db, scope, async (trx) => {
        const rows =
          await sql<FlagRow>`SELECT ${FLAG_COLUMNS} FROM ${FLAG_FROM} WHERE f.id = ${id}`.execute(
            trx,
          );
        const [row] = rows.rows;
        if (row === undefined) return null;
        const flag = toFlag(row);
        const activity = await sql<{
          action: string;
          actor_name: string | null;
          at: Date;
          details: Record<string, unknown>;
        }>`
          SELECT action, actor_name, at, details FROM audit.audit_log
           WHERE subject_type = 'anomaly_flag' AND subject_id = ${id}
           ORDER BY at, id`.execute(trx);
        // Previous / next flag of the same month and subsidiary, in reference order.
        const neighbours = await sql<{ previous_id: string | null; next_id: string | null }>`
          SELECT (SELECT f.id FROM groupdata.anomaly_flag f
                   WHERE f.period = ${`${flag.period}-01`}::date AND f.reference < ${flag.reference}
                   ORDER BY f.reference DESC LIMIT 1) AS previous_id,
                 (SELECT f.id FROM groupdata.anomaly_flag f
                   WHERE f.period = ${`${flag.period}-01`}::date AND f.reference > ${flag.reference}
                   ORDER BY f.reference LIMIT 1) AS next_id`.execute(trx);
        const around = only(neighbours);
        return {
          flag,
          activity: activity.rows.map((entry) => ({
            action: entry.action,
            actorName: entry.actor_name,
            at: entry.at,
            details: entry.details,
          })),
          previousId: around.previous_id,
          nextId: around.next_id,
        };
      }),

    owners: (scope, entityId) =>
      withScope(db, scope, async (trx) => {
        const rows = await sql<{ id: string; name: string }>`
          SELECT DISTINCT ON (id) id, name FROM (
            SELECT uploaded_by AS id, uploaded_by_name AS name, uploaded_at AS at
              FROM groupdata.upload WHERE entity_id = ${entityId}
            UNION ALL
            SELECT owner_id, owner_name, updated_at FROM groupdata.anomaly_flag WHERE entity_id = ${entityId}
          ) people ORDER BY id, at DESC`.execute(trx);
        return rows.rows.sort((a, b) => a.name.localeCompare(b.name));
      }),

    updateFlag: (scope, id, input) =>
      withScope(db, scope, async (trx) => {
        const rows = await sql<FlagRow>`
          SELECT ${FLAG_COLUMNS} FROM ${FLAG_FROM} WHERE f.id = ${id} FOR UPDATE OF f`.execute(trx);
        const [current] = rows.rows;
        if (current === undefined) throw new DataQualityError('not_found');
        if (current.status === 'resolved' && current.resolved_reason === 'superseded') {
          throw new DataQualityError('superseded');
        }
        const owner = input.owner ?? { id: current.owner_id, name: current.owner_name };
        const resolved = input.status === 'resolved';
        await sql`
          UPDATE groupdata.anomaly_flag
             SET owner_id = ${owner.id}, owner_name = ${owner.name}, status = ${input.status},
                 resolution_note = ${input.note === null ? null : cipher.encrypt(input.note, { ...FLAG_NOTE, rowId: id })},
                 resolved_at = ${resolved ? sql`coalesce(resolved_at, clock_timestamp())` : sql`NULL`},
                 updated_at = clock_timestamp()
           WHERE id = ${id}`.execute(trx);
        await recordAudit(trx, scope.userId, {
          action: 'anomaly_flag.updated',
          entityId: current.entity_id,
          subjectType: 'anomaly_flag',
          subjectId: id,
          // Never the note's text: it can discuss pay.
          details: {
            reference: current.reference,
            from: current.status,
            to: input.status,
            owner: owner.name,
            ownerChanged: owner.id !== current.owner_id,
            note: input.note !== null,
          },
        });
        const updated =
          await sql<FlagRow>`SELECT ${FLAG_COLUMNS} FROM ${FLAG_FROM} WHERE f.id = ${id}`.execute(
            trx,
          );
        const flag = toFlag(only(updated));
        await insertNotifications(trx, input.notifications({ flag }));
        return flag;
      }),

    remind: (scope, id, notifications) =>
      withScope(db, scope, async (trx) => {
        const rows =
          await sql<FlagRow>`SELECT ${FLAG_COLUMNS} FROM ${FLAG_FROM} WHERE f.id = ${id}`.execute(
            trx,
          );
        const [row] = rows.rows;
        if (row === undefined) throw new DataQualityError('not_found');
        await recordAudit(trx, scope.userId, {
          action: 'anomaly_flag.reminded',
          entityId: row.entity_id,
          subjectType: 'anomaly_flag',
          subjectId: id,
          details: { reference: row.reference, owner: row.owner_name },
        });
        await insertNotifications(trx, notifications({ flag: toFlag(row) }));
      }),
  };
}

export type DataQualityErrorReason = 'not_found' | 'superseded';

export class DataQualityError extends Error {
  constructor(readonly reason: DataQualityErrorReason) {
    super(reason);
    this.name = 'DataQualityError';
  }
}
