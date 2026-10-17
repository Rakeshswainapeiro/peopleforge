import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import { recordAudit } from './audit.js';
import { loadCriteriaSets, type CriterionRecord } from './criteria-sets.js';
import { APPROVED_VALUE, DECISION_COMMENT, PROPOSED, SALARY } from './encrypted-fields.js';
import type { FieldCipher } from './field-crypto.js';
import { RequestDataError } from './increment-requests.js';
import { insertNotifications, type NewNotification } from './notifications.js';
import type {
  CriterionResultValue,
  Database,
  LineDecisionValue,
  LineReviewStatus,
  ProposedKind,
  RequestStatus,
} from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Sirius HR's review (R1-07 … R1-10): verifying criteria, deciding each employee (approve,
 * reject, return), the subsidiary resubmitting returned employees, and the review queue. Every
 * change locks the request, records its status history and audit trail, and queues
 * notifications in one transaction, like submitting (ADR-011). Row-Level Security applies.
 */

/** Statuses in which Sirius HR reviews: submitted, being reviewed, or partly returned. */
export const IN_REVIEW: readonly RequestStatus[] = ['submitted', 'under_review', 'returned'];
const FINAL: readonly RequestStatus[] = ['approved', 'partly_approved', 'rejected'];

/** What a decision's notifications need to know (the API words them). */
export interface DecisionContext {
  reference: string;
  entityId: string;
  requestId: string;
  /** The subsidiary user who submitted the request: who hears about decisions. */
  submittedBy: string | null;
  employeeName: string;
  /** The request's status after this decision (final once every employee is decided). */
  requestStatus: RequestStatus;
}

export interface ResubmitContext {
  reference: string;
  entityId: string;
  requestId: string;
  /** How many returned employees went back to Sirius HR. */
  employees: number;
}

export interface StageContext {
  reference: string;
  entityId: string;
  requestId: string;
  submittedBy: string | null;
  /** The criterion now under review (1-based), after every employee's earlier ones were verified. */
  criterion: number;
  of: number;
}

export interface DecisionInput {
  requestId: string;
  lineId: string;
  idempotencyKey: string;
  decision: LineDecisionValue;
  reasonCode: string | null;
  comment: string;
  /** An approval at another increment than proposed (decimal string), or null for as proposed. */
  approved: { kind: ProposedKind; value: string } | null;
  actorName: string;
  notifications: (context: DecisionContext) => readonly NewNotification[];
}

/** The review queue's filters (Figma "Review queue" chips). */
export type QueueFilter = 'all' | 'pending' | 'returned' | 'overdue' | 'open';

export interface QueueQuery {
  cycleId?: string | undefined;
  entityId?: string | undefined;
  search?: string | undefined;
  filter: QueueFilter;
  /** Pending employees waiting since before this are "past reminder time". */
  overdueBefore: Date;
  limit: number;
  offset: number;
}

export interface QueueLineRecord {
  lineId: string;
  request: {
    id: string;
    reference: string;
    status: RequestStatus;
    entityId: string;
    entityCode: string;
    /** Criteria verified for every employee still in review (the stage), and their number. */
    verifiedCriteria: number;
  };
  employeeNumber: string;
  fullName: string;
  grade: string;
  currency: string;
  /** Decimal string, to derive the percentage; never listed. */
  currentSalary: string;
  proposedKind: ProposedKind | null;
  proposedValue: string | null;
  criteria: CriterionRecord[];
  /** What the subsidiary submitted, per criterion in set order (null: none). */
  results: (CriterionResultValue | null)[];
  /** Criteria verified for this employee. */
  verified: number;
  reviewStatus: LineReviewStatus;
  /** Since when the employee has waited in its review status. */
  waitingSince: Date;
}

export interface QueueCounts {
  all: number;
  pending: number;
  returned: number;
  overdue: number;
  open: number;
  /** Requests with an employee pending or returned, and how many subsidiaries they span. */
  openRequests: number;
  openEntities: number;
}

export interface ReviewRepository {
  /** Ticks or unticks one criterion for one employee ("Mark verified"). */
  verify: (
    scope: Scope,
    input: {
      requestId: string;
      lineId: string;
      criterionId: string;
      verified: boolean;
      actorName: string;
      notifications: (context: StageContext) => readonly NewNotification[];
    },
  ) => Promise<void>;
  /** Approves, rejects or returns one employee (R1-09); a repeated key is a replay. */
  decide: (scope: Scope, input: DecisionInput) => Promise<{ replayed: boolean }>;
  /** The subsidiary sends its returned employees back to Sirius HR (R1-08). */
  resubmit: (
    scope: Scope,
    requestId: string,
    input: {
      version: number;
      idempotencyKey: string;
      note: string;
      notifications: (context: ResubmitContext) => readonly NewNotification[];
    },
  ) => Promise<{ replayed: boolean }>;
  queue: (
    scope: Scope,
    query: QueueQuery,
  ) => Promise<{ items: QueueLineRecord[]; total: number; counts: QueueCounts }>;
}

type Trx = Transaction<Database>;

/**
 * The request status that follows from its employees (R1-09): final once every employee is
 * approved or rejected; returned while any is with the subsidiary; otherwise under review.
 */
export function statusFromLines(lines: readonly LineReviewStatus[]): RequestStatus {
  if (lines.length > 0 && lines.every((line) => line === 'approved' || line === 'rejected')) {
    if (lines.every((line) => line === 'approved')) return 'approved';
    if (lines.every((line) => line === 'rejected')) return 'rejected';
    return 'partly_approved';
  }
  return lines.includes('returned') ? 'returned' : 'under_review';
}

/** Claims an idempotency key for this request; true when it was already claimed (a replay). */
async function claimKey(trx: Trx, userId: string, key: string, requestId: string) {
  const claimed = await trx
    .insertInto('increments.idempotency_key')
    .values({ user_id: userId, key, request_id: requestId })
    .onConflict((oc) => oc.columns(['user_id', 'key']).doNothing())
    .returning('request_id')
    .executeTakeFirst();
  if (claimed !== undefined) return false;
  const existing = await trx
    .selectFrom('increments.idempotency_key')
    .select('request_id')
    .where('user_id', '=', userId)
    .where('key', '=', key)
    .executeTakeFirstOrThrow();
  if (existing.request_id !== requestId) throw new RequestDataError('idempotency_conflict');
  return true;
}

async function lockRequest(trx: Trx, requestId: string) {
  const request = await trx
    .selectFrom('increments.increment_request')
    .select([
      'id',
      'entity_id',
      'status',
      'reference',
      'version',
      'criteria_set_id',
      'submitted_by',
    ])
    .where('id', '=', requestId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  if (request === undefined) throw new RequestDataError('not_found');
  return request;
}

/**
 * Criteria verified for every employee still pending review: the request's stage (R1-10,
 * "Criterion n of 5"). Criteria can be verified in any order; the stage counts finished ones.
 */
async function verifiedCriteria(trx: Trx, requestId: string, criteriaSetId: string) {
  const row = await trx
    .selectFrom('increments.criterion as c')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('c.criteria_set_id', '=', criteriaSetId)
    .where(
      sql<boolean>`not exists (
        select 1 from increments.request_line l
        where l.request_id = ${requestId} and l.deleted_at is null and l.review_status = 'pending'
          and not exists (select 1 from increments.criterion_verification v
                          where v.line_id = l.id and v.criterion_id = c.id))`,
    )
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

async function criteriaCount(trx: Trx, criteriaSetId: string): Promise<number> {
  const row = await trx
    .selectFrom('increments.criterion')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('criteria_set_id', '=', criteriaSetId)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

/** Moves the request to `to` (if it differs): status, history and audit together. */
async function changeStatus(
  trx: Trx,
  actor: string,
  request: { id: string; entity_id: string; status: RequestStatus; reference: string },
  to: RequestStatus,
  reason: string | null,
): Promise<void> {
  if (request.status === to) return;
  await trx
    .updateTable('increments.increment_request')
    .set({
      status: to,
      status_changed_at: sql`now()`,
      decided_at: FINAL.includes(to) ? sql`now()` : null,
      version: sql`version + 1`,
      updated_at: sql`now()`,
      updated_by: actor,
    })
    .where('id', '=', request.id)
    .execute();
  await trx
    .insertInto('increments.status_event')
    .values({
      request_id: request.id,
      entity_id: request.entity_id,
      from_status: request.status,
      to_status: to,
      actor,
      reason,
    })
    .execute();
  await recordAudit(trx, actor, {
    action: 'increment_request.status_changed',
    entityId: request.entity_id,
    subjectType: 'increment_request',
    subjectId: request.id,
    details: { reference: request.reference, from: request.status, to },
  });
}

async function lineStatuses(trx: Trx, requestId: string): Promise<LineReviewStatus[]> {
  const rows = await trx
    .selectFrom('increments.request_line')
    .select('review_status')
    .where('request_id', '=', requestId)
    .where('deleted_at', 'is', null)
    .execute();
  return rows.map((row) => row.review_status);
}

/** `%text%` for LIKE, with the user's own %, _ and \ taken literally. */
function contains(search: string): string {
  return `%${search.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}

export function createReviewRepository(
  db: Kysely<Database>,
  cipher: FieldCipher,
): ReviewRepository {
  return {
    verify: (scope, input) =>
      withScope(db, scope, async (trx) => {
        const request = await lockRequest(trx, input.requestId);
        if (!IN_REVIEW.includes(request.status)) throw new RequestDataError('not_in_review');
        const line = await trx
          .selectFrom('increments.request_line')
          .select(['id', 'review_status'])
          .where('id', '=', input.lineId)
          .where('request_id', '=', input.requestId)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (line === undefined) throw new RequestDataError('line_not_found', input.lineId);
        if (line.review_status !== 'pending') {
          throw new RequestDataError('line_not_pending', input.lineId);
        }
        const criterion = await trx
          .selectFrom('increments.criterion')
          .select('id')
          .where('id', '=', input.criterionId)
          .where('criteria_set_id', '=', request.criteria_set_id)
          .executeTakeFirst();
        if (criterion === undefined) {
          throw new RequestDataError('criterion_not_found', input.criterionId);
        }
        const before = await verifiedCriteria(trx, request.id, request.criteria_set_id);
        if (input.verified) {
          await trx
            .insertInto('increments.criterion_verification')
            .values({
              line_id: input.lineId,
              entity_id: request.entity_id,
              criterion_id: input.criterionId,
              verified_by: scope.userId,
              verified_by_name: input.actorName,
            })
            .onConflict((oc) => oc.columns(['line_id', 'criterion_id']).doNothing())
            .execute();
        } else {
          await trx
            .deleteFrom('increments.criterion_verification')
            .where('line_id', '=', input.lineId)
            .where('criterion_id', '=', input.criterionId)
            .execute();
        }
        await recordAudit(trx, scope.userId, {
          action: input.verified ? 'criterion.verified' : 'criterion.unverified',
          entityId: request.entity_id,
          subjectType: 'request_line',
          subjectId: input.lineId,
          details: { requestId: request.id, criterionId: input.criterionId },
        });
        // The first action of the review moves a submitted request under review.
        if (request.status === 'submitted') {
          await changeStatus(trx, scope.userId, request, 'under_review', null);
        }
        const after = await verifiedCriteria(trx, request.id, request.criteria_set_id);
        const of = await criteriaCount(trx, request.criteria_set_id);
        if (after > before && after < of) {
          await insertNotifications(
            trx,
            input.notifications({
              reference: request.reference,
              entityId: request.entity_id,
              requestId: request.id,
              submittedBy: request.submitted_by,
              criterion: after + 1,
              of,
            }),
          );
        }
      }),

    decide: (scope, input) =>
      withScope(db, scope, async (trx) => {
        if (await claimKey(trx, scope.userId, input.idempotencyKey, input.requestId)) {
          return { replayed: true };
        }
        const request = await lockRequest(trx, input.requestId);
        if (!IN_REVIEW.includes(request.status)) throw new RequestDataError('not_in_review');
        const line = await trx
          .selectFrom('increments.request_line')
          .select(['id', 'review_status', 'full_name'])
          .where('id', '=', input.lineId)
          .where('request_id', '=', input.requestId)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (line === undefined) throw new RequestDataError('line_not_found', input.lineId);
        if (line.review_status !== 'pending') {
          throw new RequestDataError('line_not_pending', input.lineId);
        }
        if (input.decision === 'approved') {
          // Approving means Sirius HR checked every criterion (R1-07): all must be verified.
          const of = await criteriaCount(trx, request.criteria_set_id);
          const verified = await trx
            .selectFrom('increments.criterion_verification')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .where('line_id', '=', input.lineId)
            .executeTakeFirstOrThrow();
          if (Number(verified.n) < of) throw new RequestDataError('not_verified', input.lineId);
        }
        // The row ID is the ciphertexts' associated data, so it is chosen first.
        const id = randomUUID();
        const comment = input.comment.trim();
        await trx
          .insertInto('increments.line_decision')
          .values({
            id,
            line_id: input.lineId,
            entity_id: request.entity_id,
            request_id: request.id,
            decision: input.decision,
            reason_code: input.reasonCode,
            comment:
              comment === '' ? null : cipher.encrypt(comment, { ...DECISION_COMMENT, rowId: id }),
            approved_kind: input.approved?.kind ?? null,
            approved_value:
              input.approved === null
                ? null
                : cipher.encrypt(input.approved.value, { ...APPROVED_VALUE, rowId: id }),
            decided_by: scope.userId,
            decided_by_name: input.actorName,
          })
          .execute();
        await trx
          .updateTable('increments.request_line')
          .set({
            review_status: input.decision,
            review_changed_at: sql`now()`,
            updated_at: sql`now()`,
            updated_by: scope.userId,
          })
          .where('id', '=', input.lineId)
          .execute();
        await recordAudit(trx, scope.userId, {
          action: `request_line.${input.decision}`,
          entityId: request.entity_id,
          subjectType: 'request_line',
          subjectId: input.lineId,
          details: {
            requestId: request.id,
            reasonCode: input.reasonCode,
            changedIncrement: input.approved !== null,
          },
        });
        const to = statusFromLines(await lineStatuses(trx, request.id));
        await changeStatus(trx, scope.userId, request, to, input.reasonCode);
        await insertNotifications(
          trx,
          input.notifications({
            reference: request.reference,
            entityId: request.entity_id,
            requestId: request.id,
            submittedBy: request.submitted_by,
            employeeName: line.full_name,
            requestStatus: to,
          }),
        );
        return { replayed: false };
      }),

    resubmit: (scope, requestId, input) =>
      withScope(db, scope, async (trx) => {
        if (await claimKey(trx, scope.userId, input.idempotencyKey, requestId)) {
          return { replayed: true };
        }
        const request = await lockRequest(trx, requestId);
        if (request.status !== 'returned') throw new RequestDataError('not_returned');
        if (request.version !== input.version) throw new RequestDataError('version_conflict');
        const returned = await trx
          .selectFrom('increments.request_line')
          .select('id')
          .where('request_id', '=', requestId)
          .where('review_status', '=', 'returned')
          .where('deleted_at', 'is', null)
          .execute();
        const ids = returned.map((line) => line.id);
        // The subsidiary changed what Sirius HR had checked: those employees are checked again.
        await trx
          .deleteFrom('increments.criterion_verification')
          .where('line_id', 'in', ids)
          .execute();
        await trx
          .updateTable('increments.request_line')
          .set({
            review_status: 'pending',
            review_changed_at: sql`now()`,
            updated_at: sql`now()`,
            updated_by: scope.userId,
          })
          .where('id', 'in', ids)
          .execute();
        await recordAudit(trx, scope.userId, {
          action: 'increment_request.resubmitted',
          entityId: request.entity_id,
          subjectType: 'increment_request',
          subjectId: requestId,
          details: { reference: request.reference, employees: ids.length },
        });
        const note = input.note.trim();
        await changeStatus(
          trx,
          scope.userId,
          request,
          statusFromLines(await lineStatuses(trx, requestId)),
          note === '' ? null : note,
        );
        await insertNotifications(
          trx,
          input.notifications({
            reference: request.reference,
            entityId: request.entity_id,
            requestId,
            employees: ids.length,
          }),
        );
        return { replayed: false };
      }),

    queue: (scope, query) =>
      withScope(db, scope, async (trx) => {
        const base = [
          sql<boolean>`l.deleted_at is null`,
          sql<boolean>`r.deleted_at is null`,
          sql<boolean>`r.status <> 'draft'`,
        ];
        if (query.cycleId !== undefined) base.push(sql<boolean>`r.cycle_id = ${query.cycleId}`);
        if (query.entityId !== undefined) base.push(sql<boolean>`r.entity_id = ${query.entityId}`);
        if (query.search !== undefined) {
          const pattern = contains(query.search);
          base.push(
            sql<boolean>`(lower(l.full_name) like lower(${pattern}) or lower(l.employee_number) like lower(${pattern}) or lower(r.reference) like lower(${pattern}))`,
          );
        }
        const waiting = sql<Date>`coalesce(l.review_changed_at, r.submitted_at, r.created_at)`;
        const overdue = sql<boolean>`(l.review_status = 'pending' and ${waiting} < ${query.overdueBefore})`;
        const byFilter: Record<QueueFilter, ReturnType<typeof sql<boolean>>> = {
          all: sql<boolean>`true`,
          pending: sql<boolean>`l.review_status = 'pending'`,
          returned: sql<boolean>`l.review_status = 'returned'`,
          overdue,
          open: sql<boolean>`l.review_status in ('pending', 'returned')`,
        };
        const where = sql<boolean>`(${sql.join(base, sql` and `)})`;
        const counts = await trx
          .selectFrom('increments.request_line as l')
          .innerJoin('increments.increment_request as r', 'r.id', 'l.request_id')
          .select([
            sql<number>`count(*)::int`.as('all'),
            sql<number>`count(*) filter (where l.review_status = 'pending')::int`.as('pending'),
            sql<number>`count(*) filter (where l.review_status = 'returned')::int`.as('returned'),
            sql<number>`count(*) filter (where ${overdue})::int`.as('overdue'),
            sql<number>`count(*) filter (where l.review_status in ('pending', 'returned'))::int`.as(
              'open',
            ),
            sql<number>`count(distinct r.id) filter (where l.review_status in ('pending', 'returned'))::int`.as(
              'open_requests',
            ),
            sql<number>`count(distinct r.entity_id) filter (where l.review_status in ('pending', 'returned'))::int`.as(
              'open_entities',
            ),
          ])
          .where(where)
          .executeTakeFirstOrThrow();
        const filtered = sql<boolean>`(${where} and ${byFilter[query.filter]})`;
        const rows = await trx
          .selectFrom('increments.request_line as l')
          .innerJoin('increments.increment_request as r', 'r.id', 'l.request_id')
          .innerJoin('core.entity as e', 'e.id', 'r.entity_id')
          .select([
            'l.id',
            'l.request_id',
            'r.reference',
            'r.status',
            'r.entity_id',
            'e.code as entity_code',
            'r.criteria_set_id',
            'l.employee_number',
            'l.full_name',
            'l.grade',
            'l.currency',
            'l.current_salary',
            'l.proposed_kind',
            'l.proposed_value',
            'l.review_status',
            waiting.as('waiting_since'),
          ])
          .where(filtered)
          // Waiting for review first, longest waiting first; then the subsidiary's; then decided.
          .orderBy(
            sql`case l.review_status when 'pending' then 0 when 'returned' then 1 else 2 end`,
          )
          .orderBy(waiting)
          .orderBy('l.id')
          .limit(query.limit)
          .offset(query.offset)
          .execute();
        const sets = await loadCriteriaSets(
          trx,
          rows.map((row) => row.criteria_set_id),
        );
        const lineIds = rows.map((row) => row.id);
        const results =
          lineIds.length === 0
            ? []
            : await trx
                .selectFrom('increments.criterion_result')
                .select(['line_id', 'criterion_id', 'result'])
                .where('line_id', 'in', lineIds)
                .execute();
        const verifications =
          lineIds.length === 0
            ? []
            : await trx
                .selectFrom('increments.criterion_verification')
                .select(['line_id', (eb) => eb.fn.countAll<string>().as('n')])
                .where('line_id', 'in', lineIds)
                .groupBy('line_id')
                .execute();
        // The stage of each request on the page, worked out once per request.
        const stages = new Map<string, number>();
        for (const row of rows) {
          if (!stages.has(row.request_id)) {
            stages.set(
              row.request_id,
              await verifiedCriteria(trx, row.request_id, row.criteria_set_id),
            );
          }
        }
        const resultOf = new Map(
          results.map((row) => [`${row.line_id}:${row.criterion_id}`, row.result]),
        );
        const verifiedOf = new Map(verifications.map((row) => [row.line_id, Number(row.n)]));
        return {
          total: counts[query.filter],
          counts: {
            all: counts.all,
            pending: counts.pending,
            returned: counts.returned,
            overdue: counts.overdue,
            open: counts.open,
            openRequests: counts.open_requests,
            openEntities: counts.open_entities,
          },
          items: rows.map((row) => {
            const criteria = sets.of(row.criteria_set_id);
            return {
              lineId: row.id,
              request: {
                id: row.request_id,
                reference: row.reference,
                status: row.status,
                entityId: row.entity_id,
                entityCode: row.entity_code,
                verifiedCriteria: Number(stages.get(row.request_id)),
              },
              employeeNumber: row.employee_number,
              fullName: row.full_name,
              grade: row.grade,
              currency: row.currency,
              currentSalary: cipher.decrypt(row.current_salary, { ...SALARY, rowId: row.id }),
              proposedKind: row.proposed_kind,
              proposedValue:
                row.proposed_value === null
                  ? null
                  : cipher.decrypt(row.proposed_value, { ...PROPOSED, rowId: row.id }),
              criteria,
              results: criteria.map(
                (criterion) => resultOf.get(`${row.id}:${criterion.id}`) ?? null,
              ),
              verified: verifiedOf.get(row.id) ?? 0,
              reviewStatus: row.review_status,
              waitingSince: row.waiting_since,
            };
          }),
        };
      }),
  };
}
