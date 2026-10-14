import { randomUUID } from 'node:crypto';
import { MAX_EVIDENCE_PER_CRITERION } from '@peopleforge/contracts';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { FieldCipher } from './field-crypto.js';
import type {
  CriterionResultValue,
  Database,
  LocalisedText,
  ProposedKind,
  RequestStatus,
} from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Data access for increment requests (R1-02). Every call runs under Row-Level Security in the
 * caller's scope (ADR-002), so another subsidiary's request simply doesn't exist here. Salary
 * and proposed values are encrypted per row (ADR-008); this layer encrypts and decrypts, the
 * API does the arithmetic.
 */

export interface CycleRecord {
  id: string;
  name: LocalisedText;
  startsOn: string;
  endsOn: string;
  submissionDeadline: string | null;
  status: 'planned' | 'open' | 'closed';
}

export interface EmployeeOption {
  id: string;
  employeeNumber: string;
  fullName: string;
  grade: string;
}

export type EvidencePolicy = 'required' | 'optional' | 'none';

/** One criterion of the request's pinned set, with what it asks for (R1-03, R1-05). */
export interface CriterionRecord {
  id: string;
  code: string;
  name: LocalisedText;
  description: LocalisedText;
  justificationRequired: boolean;
  evidencePolicy: EvidencePolicy;
  allowedMediaTypes: string[];
  maxFileMb: number;
}

export interface EvidenceRecord {
  id: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: Date;
}

/** An employee's standing on one criterion: result, justification, files (R1-03, R1-04). */
export interface CriterionAssessmentRecord {
  criterionId: string;
  result: CriterionResultValue | null;
  /** Plain text; empty when none. */
  justification: string;
  evidence: EvidenceRecord[];
}

export interface RequestLineRecord {
  id: string;
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  grade: string;
  /** Decimal string, e.g. "21500.00". */
  currentSalary: string;
  currency: string;
  proposedKind: ProposedKind | null;
  /** Decimal string: a percentage ("8.00") or an amount ("1720.00"), per proposedKind. */
  proposedValue: string | null;
  /** One entry per criterion of the request's set, in display order. */
  criteria: CriterionAssessmentRecord[];
}

export interface IncrementRequestRecord {
  id: string;
  reference: string;
  status: RequestStatus;
  entity: { id: string; code: string; name: LocalisedText };
  cycle: { id: string; name: LocalisedText };
  criteriaSetId: string;
  /** The criteria of the pinned set, in display order. */
  criteria: CriterionRecord[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  lines: RequestLineRecord[];
}

export interface RequestSummaryRecord {
  id: string;
  reference: string;
  status: RequestStatus;
  entityId: string;
  cycleId: string;
  employeeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Proposal {
  lineId: string;
  /** Both null clears the proposal. */
  kind: ProposedKind | null;
  value: string | null;
}

export interface CriterionInput {
  criterionId: string;
  result: CriterionResultValue | null;
  /** Plain text; empty clears it. Length is checked by the API contract. */
  justification: string;
}

export interface DraftChanges {
  version: number;
  proposals: readonly Proposal[];
  /** One employee's criteria, saved with the proposals in one transaction. */
  assessment?: { lineId: string; results: readonly CriterionInput[] } | undefined;
}

/** A scanned, stored file to record against a criterion. */
export interface NewEvidence {
  id: string;
  lineId: string;
  criterionId: string;
  objectKey: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  scanEngine: string;
  scannedAt: Date;
}

export interface EvidenceLocation {
  id: string;
  requestStatus: RequestStatus;
  objectKey: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
}

export type RequestDataErrorReason =
  | 'not_found'
  | 'version_conflict'
  | 'duplicate_employee'
  | 'employee_not_found'
  | 'line_not_found'
  | 'cycle_not_open'
  | 'entity_not_found'
  | 'no_active_criteria'
  | 'criterion_not_found'
  | 'evidence_limit'
  | 'evidence_not_found';

/** An expected refusal (bad reference, stale version, …), mapped to 4xx by the API. */
export class RequestDataError extends Error {
  constructor(
    readonly reason: RequestDataErrorReason,
    /** The offending ID, when there is one (an employee, a line). */
    readonly subject?: string,
  ) {
    super(reason);
    this.name = 'RequestDataError';
  }
}

export interface IncrementRequestRepository {
  openCycles: (scope: Scope) => Promise<CycleRecord[]>;
  searchEmployees: (
    scope: Scope,
    query: { entityId: string; search?: string; excludeRequestId?: string; limit: number },
  ) => Promise<EmployeeOption[]>;
  create: (
    scope: Scope,
    input: {
      entityId: string;
      cycleId: string;
      employeeIds: readonly string[];
      idempotencyKey: string;
    },
  ) => Promise<{ id: string; created: boolean }>;
  get: (scope: Scope, id: string) => Promise<IncrementRequestRecord | null>;
  list: (
    scope: Scope,
    query: { status?: RequestStatus; includeDrafts: boolean; limit: number; offset: number },
  ) => Promise<{ items: RequestSummaryRecord[]; total: number }>;
  addLine: (scope: Scope, requestId: string, employeeId: string) => Promise<void>;
  /**
   * Removes an employee. Removing the last one discards the draft (soft delete): an empty
   * draft is not a request, and must not linger in "Needs your action".
   */
  removeLine: (scope: Scope, requestId: string, lineId: string) => Promise<{ discarded: boolean }>;
  /** Saves proposals and, optionally, one employee's criteria (optimistic lock on version). */
  saveDraft: (scope: Scope, requestId: string, input: DraftChanges) => Promise<void>;
  /**
   * Records a file that is already scanned and stored. Doesn't change the request's version:
   * an upload must not invalidate the form the user is editing.
   */
  addEvidence: (scope: Scope, requestId: string, file: NewEvidence) => Promise<EvidenceRecord>;
  /** Soft-deletes a file; the stored object is kept (retention open, Q10). */
  removeEvidence: (scope: Scope, requestId: string, evidenceId: string) => Promise<void>;
  /** Where a live file is stored, or null when it isn't visible in this scope. */
  getEvidence: (
    scope: Scope,
    requestId: string,
    evidenceId: string,
  ) => Promise<EvidenceLocation | null>;
}

type Trx = Transaction<Database>;

const SALARY = { table: 'increments.request_line', column: 'current_salary' } as const;
const PROPOSED = { table: 'increments.request_line', column: 'proposed_value' } as const;
const JUSTIFICATION = { table: 'increments.criterion_result', column: 'justification' } as const;

export function createIncrementRequestRepository(
  db: Kysely<Database>,
  cipher: FieldCipher,
): IncrementRequestRepository {
  /** Locks the request for the rest of the transaction (serialises concurrent edits). */
  async function lockDraft(trx: Trx, requestId: string) {
    const request = await trx
      .selectFrom('increments.increment_request')
      .select(['id', 'entity_id', 'version', 'criteria_set_id'])
      .where('id', '=', requestId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (request === undefined) throw new RequestDataError('not_found');
    // Only drafts exist until submission arrives (S4), which adds the editable-status check.
    return request;
  }

  /** A live line of the request, or line_not_found. */
  async function assertLine(trx: Trx, requestId: string, lineId: string): Promise<void> {
    const line = await trx
      .selectFrom('increments.request_line')
      .select('id')
      .where('id', '=', lineId)
      .where('request_id', '=', requestId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (line === undefined) throw new RequestDataError('line_not_found', lineId);
  }

  /** A criterion of the request's pinned set, or criterion_not_found. */
  async function assertCriterion(trx: Trx, criteriaSetId: string, criterionId: string) {
    const criterion = await trx
      .selectFrom('increments.criterion')
      .select('id')
      .where('id', '=', criterionId)
      .where('criteria_set_id', '=', criteriaSetId)
      .executeTakeFirst();
    if (criterion === undefined) throw new RequestDataError('criterion_not_found', criterionId);
  }

  async function saveAssessment(
    trx: Trx,
    request: { id: string; entity_id: string; criteria_set_id: string },
    assessment: NonNullable<DraftChanges['assessment']>,
    actor: string,
  ): Promise<void> {
    await assertLine(trx, request.id, assessment.lineId);
    const existing = await trx
      .selectFrom('increments.criterion_result')
      .select(['id', 'criterion_id'])
      .where('line_id', '=', assessment.lineId)
      .execute();
    const idFor = new Map(existing.map((row) => [row.criterion_id, row.id]));
    for (const input of assessment.results) {
      await assertCriterion(trx, request.criteria_set_id, input.criterionId);
      // The row ID is the ciphertext's associated data, so an existing row keeps its ID.
      const id = idFor.get(input.criterionId) ?? randomUUID();
      const text = input.justification.trim();
      const justification =
        text === '' ? null : cipher.encrypt(text, { ...JUSTIFICATION, rowId: id });
      await trx
        .insertInto('increments.criterion_result')
        .values({
          id,
          line_id: assessment.lineId,
          entity_id: request.entity_id,
          criterion_id: input.criterionId,
          result: input.result,
          justification,
          created_by: actor,
          updated_by: actor,
        })
        .onConflict((oc) =>
          oc.columns(['line_id', 'criterion_id']).doUpdateSet({
            result: input.result,
            justification,
            updated_at: sql`now()`,
            updated_by: actor,
          }),
        )
        .execute();
    }
  }

  async function touch(trx: Trx, requestId: string, actor: string): Promise<void> {
    await trx
      .updateTable('increments.increment_request')
      .set({ version: sql`version + 1`, updated_at: sql`now()`, updated_by: actor })
      .where('id', '=', requestId)
      .execute();
  }

  /** Adds an employee with a snapshot of grade and salary (Q2 decision). */
  async function insertLine(
    trx: Trx,
    request: { id: string; entity_id: string },
    employeeId: string,
    actor: string,
  ): Promise<void> {
    const employee = await trx
      .selectFrom('core.employee')
      .select(['id', 'employee_number', 'full_name', 'grade', 'monthly_salary', 'currency'])
      .where('id', '=', employeeId)
      .where('entity_id', '=', request.entity_id)
      .where('active', '=', true)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (employee === undefined) throw new RequestDataError('employee_not_found', employeeId);

    const salary = cipher.decrypt(employee.monthly_salary, {
      table: 'core.employee',
      column: 'monthly_salary',
      rowId: employee.id,
    });
    // Every line change holds the request's row lock (lockDraft, or a request created in this
    // transaction), so this check can't race; the unique index is the backstop.
    const existing = await trx
      .selectFrom('increments.request_line')
      .select('id')
      .where('request_id', '=', request.id)
      .where('employee_id', '=', employee.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (existing !== undefined) throw new RequestDataError('duplicate_employee', employeeId);

    // The line ID is part of the ciphertext's associated data, so it is chosen first.
    const lineId = randomUUID();
    await trx
      .insertInto('increments.request_line')
      .values({
        id: lineId,
        request_id: request.id,
        entity_id: request.entity_id,
        employee_id: employee.id,
        employee_number: employee.employee_number,
        full_name: employee.full_name,
        grade: employee.grade,
        current_salary: cipher.encrypt(salary, { ...SALARY, rowId: lineId }),
        currency: employee.currency,
        proposed_kind: null,
        proposed_value: null,
        created_by: actor,
        updated_by: actor,
      })
      .execute();
  }

  return {
    openCycles: (scope) =>
      withScope(db, scope, async (trx) => {
        const rows = await trx
          .selectFrom('core.increment_cycle')
          .select([
            'id',
            'name',
            'status',
            // Dates as ISO text: a JS Date would shift calendar days by the server's time zone.
            sql<string>`to_char(starts_on, 'YYYY-MM-DD')`.as('starts_on'),
            sql<string>`to_char(ends_on, 'YYYY-MM-DD')`.as('ends_on'),
            sql<string | null>`to_char(submission_deadline, 'YYYY-MM-DD')`.as(
              'submission_deadline',
            ),
          ])
          .where('status', '=', 'open')
          .orderBy('starts_on', 'desc')
          .execute();
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          submissionDeadline: row.submission_deadline,
          status: row.status,
        }));
      }),

    searchEmployees: (scope, query) =>
      withScope(db, scope, async (trx) => {
        let builder = trx
          .selectFrom('core.employee as e')
          .select(['e.id', 'e.employee_number', 'e.full_name', 'e.grade'])
          .where('e.entity_id', '=', query.entityId)
          .where('e.active', '=', true)
          .where('e.deleted_at', 'is', null);
        const search = query.search?.trim() ?? '';
        if (search !== '') {
          // strpos, not LIKE: no wildcard characters to escape in user input.
          builder = builder.where((eb) =>
            eb.or([
              eb(sql`strpos(lower(e.full_name), lower(${search}))`, '>', 0),
              eb(sql`strpos(lower(e.employee_number), lower(${search}))`, '>', 0),
            ]),
          );
        }
        if (query.excludeRequestId !== undefined) {
          const requestId = query.excludeRequestId;
          builder = builder.where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom('increments.request_line as l')
                  .select('l.id')
                  .whereRef('l.employee_id', '=', 'e.id')
                  .where('l.request_id', '=', requestId)
                  .where('l.deleted_at', 'is', null),
              ),
            ),
          );
        }
        const rows = await builder
          .orderBy('e.full_name')
          .orderBy('e.id')
          .limit(query.limit)
          .execute();
        return rows.map((row) => ({
          id: row.id,
          employeeNumber: row.employee_number,
          fullName: row.full_name,
          grade: row.grade,
        }));
      }),

    create: (scope, input) =>
      withScope(db, scope, async (trx) => {
        // Claim the idempotency key first. A concurrent identical request waits here until the
        // first commits, then sees the claim and returns the same draft.
        const id = randomUUID();
        const claimed = await trx
          .insertInto('increments.idempotency_key')
          .values({ user_id: scope.userId, key: input.idempotencyKey, request_id: id })
          .onConflict((oc) => oc.columns(['user_id', 'key']).doNothing())
          .returning('request_id')
          .executeTakeFirst();
        if (claimed === undefined) {
          const existing = await trx
            .selectFrom('increments.idempotency_key')
            .select('request_id')
            .where('user_id', '=', scope.userId)
            .where('key', '=', input.idempotencyKey)
            .executeTakeFirstOrThrow();
          return { id: existing.request_id, created: false };
        }

        const cycle = await trx
          .selectFrom('core.increment_cycle')
          .select(['id', 'status', sql<number>`extract(year from starts_on)::int`.as('year')])
          .where('id', '=', input.cycleId)
          .executeTakeFirst();
        if (cycle?.status !== 'open') throw new RequestDataError('cycle_not_open', input.cycleId);
        const entity = await trx
          .selectFrom('core.entity')
          .select('id')
          .where('id', '=', input.entityId)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (entity === undefined) throw new RequestDataError('entity_not_found', input.entityId);
        const criteriaSet = await trx
          .selectFrom('increments.criteria_set')
          .select('id')
          .where('status', '=', 'active')
          .executeTakeFirst();
        if (criteriaSet === undefined) throw new RequestDataError('no_active_criteria');

        const sequence = await trx
          .insertInto('increments.request_sequence')
          .values({ cycle_id: cycle.id, last_number: 1 })
          .onConflict((oc) =>
            oc
              .column('cycle_id')
              .doUpdateSet({ last_number: sql`request_sequence.last_number + 1` }),
          )
          .returning('last_number')
          .executeTakeFirstOrThrow();
        const reference = `INC-${String(cycle.year)}-${String(sequence.last_number).padStart(4, '0')}`;

        const request = await trx
          .insertInto('increments.increment_request')
          .values({
            id,
            reference,
            entity_id: input.entityId,
            cycle_id: cycle.id,
            criteria_set_id: criteriaSet.id,
            created_by: scope.userId,
            updated_by: scope.userId,
          })
          .returning(['id', 'entity_id'])
          .executeTakeFirstOrThrow();
        for (const employeeId of input.employeeIds) {
          await insertLine(trx, request, employeeId, scope.userId);
        }
        return { id, created: true };
      }),

    get: (scope, id) =>
      withScope(db, scope, async (trx) => {
        const request = await trx
          .selectFrom('increments.increment_request as r')
          .innerJoin('core.entity as e', 'e.id', 'r.entity_id')
          .innerJoin('core.increment_cycle as c', 'c.id', 'r.cycle_id')
          .select([
            'r.id',
            'r.reference',
            'r.status',
            'r.criteria_set_id',
            'r.version',
            'r.created_at',
            'r.updated_at',
            'e.id as entity_id',
            'e.code as entity_code',
            'e.name as entity_name',
            'c.id as cycle_id',
            'c.name as cycle_name',
          ])
          .where('r.id', '=', id)
          .where('r.deleted_at', 'is', null)
          .executeTakeFirst();
        if (request === undefined) return null;
        const criteria = await trx
          .selectFrom('increments.criterion')
          .select([
            'id',
            'code',
            'name',
            'description',
            'justification_required',
            'evidence_policy',
            'allowed_media_types',
            'max_file_mb',
          ])
          .where('criteria_set_id', '=', request.criteria_set_id)
          .orderBy('position')
          .execute();
        const lines = await trx
          .selectFrom('increments.request_line')
          .selectAll()
          .where('request_id', '=', id)
          .where('deleted_at', 'is', null)
          .orderBy('created_at')
          .orderBy('id')
          .execute();
        // Joined through the request's live lines: no other request's rows can appear.
        const results = await trx
          .selectFrom('increments.criterion_result as cr')
          .innerJoin('increments.request_line as l', 'l.id', 'cr.line_id')
          .select(['cr.id', 'cr.line_id', 'cr.criterion_id', 'cr.result', 'cr.justification'])
          .where('l.request_id', '=', id)
          .where('l.deleted_at', 'is', null)
          .execute();
        const files = await trx
          .selectFrom('increments.evidence_file as f')
          .innerJoin('increments.request_line as l', 'l.id', 'f.line_id')
          .select([
            'f.id',
            'f.line_id',
            'f.criterion_id',
            'f.file_name',
            'f.media_type',
            'f.size_bytes',
            'f.created_at',
          ])
          .where('l.request_id', '=', id)
          .where('l.deleted_at', 'is', null)
          .where('f.deleted_at', 'is', null)
          .orderBy('f.created_at')
          .orderBy('f.id')
          .execute();
        const saved = new Map(
          results.map((row) => [
            `${row.line_id}:${row.criterion_id}`,
            {
              result: row.result,
              justification:
                row.justification === null
                  ? ''
                  : cipher.decrypt(row.justification, { ...JUSTIFICATION, rowId: row.id }),
            },
          ]),
        );
        const assessmentsFor = (lineId: string): CriterionAssessmentRecord[] =>
          criteria.map((criterion) => {
            const entry = saved.get(`${lineId}:${criterion.id}`);
            return {
              criterionId: criterion.id,
              result: entry?.result ?? null,
              justification: entry?.justification ?? '',
              evidence: files
                .filter((file) => file.line_id === lineId && file.criterion_id === criterion.id)
                .map((file) => ({
                  id: file.id,
                  fileName: file.file_name,
                  mediaType: file.media_type,
                  sizeBytes: file.size_bytes,
                  createdAt: file.created_at,
                })),
            };
          });
        return {
          id: request.id,
          reference: request.reference,
          status: request.status,
          entity: { id: request.entity_id, code: request.entity_code, name: request.entity_name },
          cycle: { id: request.cycle_id, name: request.cycle_name },
          criteriaSetId: request.criteria_set_id,
          criteria: criteria.map((criterion) => ({
            id: criterion.id,
            code: criterion.code,
            name: criterion.name,
            description: criterion.description,
            justificationRequired: criterion.justification_required,
            evidencePolicy: criterion.evidence_policy,
            allowedMediaTypes: criterion.allowed_media_types,
            maxFileMb: criterion.max_file_mb,
          })),
          version: request.version,
          createdAt: request.created_at,
          updatedAt: request.updated_at,
          lines: lines.map((line) => ({
            id: line.id,
            employeeId: line.employee_id,
            employeeNumber: line.employee_number,
            fullName: line.full_name,
            grade: line.grade,
            currentSalary: cipher.decrypt(line.current_salary, { ...SALARY, rowId: line.id }),
            currency: line.currency,
            proposedKind: line.proposed_kind,
            proposedValue:
              line.proposed_value === null
                ? null
                : cipher.decrypt(line.proposed_value, { ...PROPOSED, rowId: line.id }),
            criteria: assessmentsFor(line.id),
          })),
        };
      }),

    list: (scope, query) =>
      withScope(db, scope, async (trx) => {
        let base = trx
          .selectFrom('increments.increment_request as r')
          .where('r.deleted_at', 'is', null);
        if (query.status !== undefined) base = base.where('r.status', '=', query.status);
        // Drafts are the subsidiary's work in progress: Sirius sees a request once it's submitted.
        if (!query.includeDrafts) base = base.where('r.status', '!=', 'draft');
        const total = await base
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow();
        const rows = await base
          .select((eb) => [
            'r.id',
            'r.reference',
            'r.status',
            'r.entity_id',
            'r.cycle_id',
            'r.created_at',
            'r.updated_at',
            eb
              .selectFrom('increments.request_line as l')
              .select((inner) => inner.fn.countAll<string>().as('n'))
              .whereRef('l.request_id', '=', 'r.id')
              .where('l.deleted_at', 'is', null)
              .as('employee_count'),
          ])
          .orderBy('r.updated_at', 'desc')
          .orderBy('r.id')
          .limit(query.limit)
          .offset(query.offset)
          .execute();
        return {
          total: Number(total.n),
          items: rows.map((row) => ({
            id: row.id,
            reference: row.reference,
            status: row.status,
            entityId: row.entity_id,
            cycleId: row.cycle_id,
            employeeCount: Number(row.employee_count),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        };
      }),

    addLine: (scope, requestId, employeeId) =>
      withScope(db, scope, async (trx) => {
        const request = await lockDraft(trx, requestId);
        await insertLine(trx, request, employeeId, scope.userId);
        await touch(trx, requestId, scope.userId);
      }),

    removeLine: (scope, requestId, lineId) =>
      withScope(db, scope, async (trx) => {
        await lockDraft(trx, requestId);
        const removed = await trx
          .updateTable('increments.request_line')
          .set({ deleted_at: sql`now()`, updated_at: sql`now()`, updated_by: scope.userId })
          .where('id', '=', lineId)
          .where('request_id', '=', requestId)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (removed.numUpdatedRows === 0n) throw new RequestDataError('line_not_found', lineId);
        const remaining = await trx
          .selectFrom('increments.request_line')
          .select('id')
          .where('request_id', '=', requestId)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (remaining === undefined) {
          await trx
            .updateTable('increments.increment_request')
            .set({ deleted_at: sql`now()`, updated_at: sql`now()`, updated_by: scope.userId })
            .where('id', '=', requestId)
            .execute();
          return { discarded: true };
        }
        await touch(trx, requestId, scope.userId);
        return { discarded: false };
      }),

    saveDraft: (scope, requestId, input) =>
      withScope(db, scope, async (trx) => {
        const request = await lockDraft(trx, requestId);
        if (request.version !== input.version) throw new RequestDataError('version_conflict');
        for (const proposal of input.proposals) {
          const value =
            proposal.kind === null || proposal.value === null
              ? null
              : cipher.encrypt(proposal.value, { ...PROPOSED, rowId: proposal.lineId });
          const updated = await trx
            .updateTable('increments.request_line')
            .set({
              proposed_kind: value === null ? null : proposal.kind,
              proposed_value: value,
              updated_at: sql`now()`,
              updated_by: scope.userId,
            })
            .where('id', '=', proposal.lineId)
            .where('request_id', '=', requestId)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();
          if (updated.numUpdatedRows === 0n) {
            throw new RequestDataError('line_not_found', proposal.lineId);
          }
        }
        if (input.assessment !== undefined) {
          await saveAssessment(trx, request, input.assessment, scope.userId);
        }
        await touch(trx, requestId, scope.userId);
      }),

    addEvidence: (scope, requestId, file) =>
      withScope(db, scope, async (trx) => {
        const request = await lockDraft(trx, requestId);
        await assertLine(trx, requestId, file.lineId);
        await assertCriterion(trx, request.criteria_set_id, file.criterionId);
        // Counted under the request's row lock, so two uploads can't both take the last slot.
        const count = await trx
          .selectFrom('increments.evidence_file')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('line_id', '=', file.lineId)
          .where('criterion_id', '=', file.criterionId)
          .where('deleted_at', 'is', null)
          .executeTakeFirstOrThrow();
        if (Number(count.n) >= MAX_EVIDENCE_PER_CRITERION) {
          throw new RequestDataError('evidence_limit', file.criterionId);
        }
        const row = await trx
          .insertInto('increments.evidence_file')
          .values({
            id: file.id,
            line_id: file.lineId,
            entity_id: request.entity_id,
            criterion_id: file.criterionId,
            object_key: file.objectKey,
            file_name: file.fileName,
            media_type: file.mediaType,
            size_bytes: file.sizeBytes,
            sha256: file.sha256,
            scan_engine: file.scanEngine,
            scanned_at: file.scannedAt,
            created_by: scope.userId,
          })
          .returning('created_at')
          .executeTakeFirstOrThrow();
        await trx
          .updateTable('increments.increment_request')
          .set({ updated_at: sql`now()`, updated_by: scope.userId })
          .where('id', '=', requestId)
          .execute();
        return {
          id: file.id,
          fileName: file.fileName,
          mediaType: file.mediaType,
          sizeBytes: file.sizeBytes,
          createdAt: row.created_at,
        };
      }),

    removeEvidence: (scope, requestId, evidenceId) =>
      withScope(db, scope, async (trx) => {
        await lockDraft(trx, requestId);
        const removed = await trx
          .updateTable('increments.evidence_file')
          .set({ deleted_at: sql`now()`, deleted_by: scope.userId })
          .where('id', '=', evidenceId)
          .where('deleted_at', 'is', null)
          .where((eb) =>
            eb(
              'line_id',
              'in',
              eb
                .selectFrom('increments.request_line')
                .select('id')
                .where('request_id', '=', requestId)
                .where('deleted_at', 'is', null),
            ),
          )
          .executeTakeFirst();
        if (removed.numUpdatedRows === 0n) {
          throw new RequestDataError('evidence_not_found', evidenceId);
        }
        await trx
          .updateTable('increments.increment_request')
          .set({ updated_at: sql`now()`, updated_by: scope.userId })
          .where('id', '=', requestId)
          .execute();
      }),

    getEvidence: (scope, requestId, evidenceId) =>
      withScope(db, scope, async (trx) => {
        const row = await trx
          .selectFrom('increments.evidence_file as f')
          .innerJoin('increments.request_line as l', 'l.id', 'f.line_id')
          .innerJoin('increments.increment_request as r', 'r.id', 'l.request_id')
          .select([
            'f.id',
            'f.object_key',
            'f.file_name',
            'f.media_type',
            'f.size_bytes',
            'r.status',
          ])
          .where('f.id', '=', evidenceId)
          .where('r.id', '=', requestId)
          .where('f.deleted_at', 'is', null)
          .where('l.deleted_at', 'is', null)
          .where('r.deleted_at', 'is', null)
          .executeTakeFirst();
        if (row === undefined) return null;
        return {
          id: row.id,
          requestStatus: row.status,
          objectKey: row.object_key,
          fileName: row.file_name,
          mediaType: row.media_type,
          sizeBytes: row.size_bytes,
        };
      }),
  };
}
