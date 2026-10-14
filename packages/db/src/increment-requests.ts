import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { FieldCipher } from './field-crypto.js';
import type { Database, LocalisedText, ProposedKind, RequestStatus } from './schema.js';
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
}

export interface IncrementRequestRecord {
  id: string;
  reference: string;
  status: RequestStatus;
  entity: { id: string; code: string; name: LocalisedText };
  cycle: { id: string; name: LocalisedText };
  criteriaSetId: string;
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

export type RequestDataErrorReason =
  | 'not_found'
  | 'version_conflict'
  | 'duplicate_employee'
  | 'employee_not_found'
  | 'line_not_found'
  | 'cycle_not_open'
  | 'entity_not_found'
  | 'no_active_criteria';

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
  removeLine: (scope: Scope, requestId: string, lineId: string) => Promise<void>;
  setProposals: (
    scope: Scope,
    requestId: string,
    input: { version: number; proposals: readonly Proposal[] },
  ) => Promise<void>;
}

type Trx = Transaction<Database>;

const SALARY = { table: 'increments.request_line', column: 'current_salary' } as const;
const PROPOSED = { table: 'increments.request_line', column: 'proposed_value' } as const;

export function createIncrementRequestRepository(
  db: Kysely<Database>,
  cipher: FieldCipher,
): IncrementRequestRepository {
  /** Locks the request for the rest of the transaction (serialises concurrent edits). */
  async function lockDraft(trx: Trx, requestId: string) {
    const request = await trx
      .selectFrom('increments.increment_request')
      .select(['id', 'entity_id', 'version'])
      .where('id', '=', requestId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (request === undefined) throw new RequestDataError('not_found');
    // Only drafts exist until submission arrives (S4), which adds the editable-status check.
    return request;
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
        const lines = await trx
          .selectFrom('increments.request_line')
          .selectAll()
          .where('request_id', '=', id)
          .where('deleted_at', 'is', null)
          .orderBy('created_at')
          .orderBy('id')
          .execute();
        return {
          id: request.id,
          reference: request.reference,
          status: request.status,
          entity: { id: request.entity_id, code: request.entity_code, name: request.entity_name },
          cycle: { id: request.cycle_id, name: request.cycle_name },
          criteriaSetId: request.criteria_set_id,
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
        await touch(trx, requestId, scope.userId);
      }),

    setProposals: (scope, requestId, input) =>
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
        await touch(trx, requestId, scope.userId);
      }),
  };
}
