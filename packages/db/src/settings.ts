import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { recordAudit } from './audit.js';
import {
  loadCriteriaSets,
  passRuleOf,
  type CriterionRecord,
  type EvidencePolicy,
  type Threshold,
} from './criteria-sets.js';
import type { Database, LocalisedText } from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * The increment portal's settings (R1-05, R1-13, NFR-CFG-01): eligibility criteria, published
 * as new versions (requests keep the version they pinned), and the reminder triggers. Who may
 * change them (`criteria:configure`) is checked in the API; every change is audited.
 */

export type ReminderKind =
  'review_overdue' | 'return_overdue' | 'deadline_approaching' | 'upload_due' | 'flag_open';

/** The order the settings screen lists them in. */
export const REMINDER_KINDS: readonly ReminderKind[] = [
  'review_overdue',
  'return_overdue',
  'deadline_approaching',
  'upload_due',
  'flag_open',
];

/** The highest criterion code ("C99", the code's CHECK allows two digits). */
const MAX_CODE = 99;

export interface ReminderRuleRecord {
  kind: ReminderKind;
  days: number;
  enabled: boolean;
  updatedAt: Date;
  updatedByName: string | null;
}

export interface ActiveCriteriaRecord {
  id: string;
  version: number;
  activatedAt: Date | null;
  criteria: CriterionRecord[];
}

/** Text as edited: Arabic may be absent until translations are provided. */
export interface EditedText {
  en: string;
  ar?: string | undefined;
}

export interface CriterionEdit {
  /** An existing criterion's code; absent for a criterion added in this version. */
  code?: string | undefined;
  name: EditedText;
  description: EditedText;
  justificationRequired: boolean;
  evidencePolicy: EvidencePolicy;
  maxFileMb: number;
  /** Passes on a measured value (R1-05); null for Pass or Fail by judgement. */
  threshold: Threshold | null;
}

export type SettingsErrorReason = 'not_found' | 'version_conflict' | 'criteria_mismatch';

/** An expected refusal, mapped to 4xx by the API. */
export class SettingsDataError extends Error {
  constructor(readonly reason: SettingsErrorReason) {
    super(reason);
    this.name = 'SettingsDataError';
  }
}

export interface SettingsRepository {
  reminderRules: (scope: Scope) => Promise<ReminderRuleRecord[]>;
  updateReminderRule: (
    scope: Scope,
    kind: ReminderKind,
    input: { days: number; enabled: boolean; actorName: string },
  ) => Promise<ReminderRuleRecord>;
  activeCriteria: (scope: Scope) => Promise<ActiveCriteriaRecord>;
  /**
   * Publishes the edited criteria as the next version and retires the active one (R1-05).
   * `version` is the version the admin edited. Each code given must be one of the active set's;
   * a criterion left out is removed; one without a code is added with the next unused code
   * (codes are never reused, so "C6" means the same criterion in every version). The list's
   * order becomes the criteria's order. Requests already created keep their pinned set.
   */
  publishCriteria: (
    scope: Scope,
    input: { version: number; criteria: readonly CriterionEdit[] },
  ) => Promise<ActiveCriteriaRecord>;
}

function toRule(row: {
  kind: string;
  days: number;
  enabled: boolean;
  updated_at: Date;
  updated_by_name: string | null;
}): ReminderRuleRecord {
  return {
    // The CHECK constraint allows only these kinds.
    kind: row.kind as ReminderKind,
    days: row.days,
    enabled: row.enabled,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}

/** Text as stored: English always, Arabic only when given. */
function localised(text: EditedText): LocalisedText {
  return text.ar === undefined ? { en: text.en } : { en: text.en, ar: text.ar };
}

export function createSettingsRepository(db: Kysely<Database>): SettingsRepository {
  const ruleColumns = ['kind', 'days', 'enabled', 'updated_at', 'updated_by_name'] as const;

  return {
    reminderRules: (scope) =>
      withScope(db, scope, async (trx) => {
        const rows = await trx.selectFrom('notify.reminder_rule').select(ruleColumns).execute();
        return REMINDER_KINDS.flatMap((kind) => rows.filter((row) => row.kind === kind)).map(
          toRule,
        );
      }),

    updateReminderRule: (scope, kind, input) =>
      withScope(db, scope, async (trx) => {
        const row = await trx
          .updateTable('notify.reminder_rule')
          .set({
            days: input.days,
            enabled: input.enabled,
            updated_at: sql`now()`,
            updated_by: scope.userId,
            updated_by_name: input.actorName,
          })
          .where('kind', '=', kind)
          .returning(ruleColumns)
          .executeTakeFirst();
        if (row === undefined) throw new SettingsDataError('not_found');
        await recordAudit(trx, scope.userId, {
          action: 'reminder_rule.updated',
          entityId: null,
          subjectType: 'reminder_rule',
          subjectId: kind,
          details: { days: input.days, enabled: input.enabled },
        });
        return toRule(row);
      }),

    activeCriteria: (scope) =>
      withScope(db, scope, async (trx) => {
        const set = await trx
          .selectFrom('increments.criteria_set')
          .select(['id', 'version', 'activated_at'])
          .where('status', '=', 'active')
          .executeTakeFirst();
        if (set === undefined) throw new SettingsDataError('not_found');
        const sets = await loadCriteriaSets(trx, [set.id]);
        return {
          id: set.id,
          version: set.version,
          activatedAt: set.activated_at,
          criteria: sets.of(set.id),
        };
      }),

    publishCriteria: (scope, input) =>
      withScope(db, scope, async (trx) => {
        // Locked: two admins publishing at once can't both retire the same version.
        const active = await trx
          .selectFrom('increments.criteria_set')
          .select(['id', 'version'])
          .where('status', '=', 'active')
          .forUpdate()
          .executeTakeFirst();
        if (active === undefined) throw new SettingsDataError('not_found');
        if (active.version !== input.version) throw new SettingsDataError('version_conflict');
        const current = await trx
          .selectFrom('increments.criterion')
          .select(['code', 'allowed_media_types'])
          .where('criteria_set_id', '=', active.id)
          .orderBy('position')
          .execute();
        const known = new Map(current.map((row) => [row.code, row]));
        if (input.criteria.some((edit) => edit.code !== undefined && !known.has(edit.code))) {
          throw new SettingsDataError('criteria_mismatch');
        }
        // Codes are never reused: a new criterion takes the next number after any ever used.
        const used = await trx
          .selectFrom('increments.criterion')
          .select(sql<number>`coalesce(max(substring(code from 2)::int), 0)`.as('n'))
          .executeTakeFirstOrThrow();
        let next = used.n;
        // File types are a security control, not an admin setting: carried over, and a new
        // criterion takes those the current criteria accept.
        const defaultTypes = [...new Set(current.flatMap((row) => row.allowed_media_types))];
        const rows = input.criteria.map((edit, index) => {
          const existing = edit.code === undefined ? undefined : known.get(edit.code);
          if (existing === undefined) next += 1;
          return {
            position: index + 1,
            code: existing?.code ?? `C${String(next)}`,
            allowedMediaTypes: existing?.allowed_media_types ?? defaultTypes,
            edit,
          };
        });
        if (next > MAX_CODE) throw new SettingsDataError('criteria_mismatch');
        const latest = await trx
          .selectFrom('increments.criteria_set')
          .select(sql<number>`max(version)::int`.as('version'))
          .executeTakeFirstOrThrow();
        await trx
          .updateTable('increments.criteria_set')
          .set({ status: 'retired', updated_at: sql`now()`, updated_by: scope.userId })
          .where('id', '=', active.id)
          .execute();
        const id = randomUUID();
        const version = latest.version + 1;
        await trx
          .insertInto('increments.criteria_set')
          .values({
            id,
            version,
            status: 'active',
            activated_at: sql`now()`,
            created_by: scope.userId,
            updated_by: scope.userId,
          })
          .execute();
        await trx
          .insertInto('increments.criterion')
          .values(
            rows.map((row) => ({
              criteria_set_id: id,
              position: row.position,
              code: row.code,
              name: localised(row.edit.name),
              description: localised(row.edit.description),
              justification_required: row.edit.justificationRequired,
              evidence_policy: row.edit.evidencePolicy,
              allowed_media_types: row.allowedMediaTypes,
              max_file_mb: row.edit.maxFileMb,
              pass_rule: passRuleOf(row.edit.threshold),
              created_by: scope.userId,
              updated_by: scope.userId,
            })),
          )
          .execute();
        await recordAudit(trx, scope.userId, {
          action: 'criteria_set.published',
          entityId: null,
          subjectType: 'criteria_set',
          subjectId: id,
          details: {
            version,
            previousVersion: active.version,
            criteria: rows.length,
            added: rows
              .filter((row) => !known.has(row.code))
              .map((row) => row.code)
              .join(','),
            removed: current
              .filter((row) => !rows.some((kept) => kept.code === row.code))
              .map((row) => row.code)
              .join(','),
            thresholds: rows
              .filter((row) => row.edit.threshold !== null)
              .map((row) => row.code)
              .join(','),
          },
        });
        const sets = await loadCriteriaSets(trx, [id]);
        const set = await trx
          .selectFrom('increments.criteria_set')
          .select('activated_at')
          .where('id', '=', id)
          .executeTakeFirstOrThrow();
        return { id, version, activatedAt: set.activated_at, criteria: sets.of(id) };
      }),
  };
}

/**
 * Queues the reminders due now (R1-13) through `notify.queue_reminders()`, the only thing the
 * worker role may do with requests (it can't read them). Returns how many were queued.
 */
export async function queueReminders(db: Kysely<Database>): Promise<number> {
  const row = await db
    .selectNoFrom(sql<number>`notify.queue_reminders()`.as('queued'))
    .executeTakeFirstOrThrow();
  return row.queued;
}

/**
 * Queues the group-data reminders that are due (R2-11): last month's data not uploaded N days
 * after month end, and flags open N days. Like `queueReminders`, the worker role may only call
 * the database function; it reads no employee data.
 */
export async function queueGroupReminders(db: Kysely<Database>): Promise<number> {
  const row = await db
    .selectNoFrom(sql<number>`notify.queue_group_reminders()`.as('queued'))
    .executeTakeFirstOrThrow();
  return row.queued;
}
