import { sql, type Kysely, type RawBuilder, type Transaction } from 'kysely';
import { loadCriteriaSets, type CriterionRecord } from './criteria-sets.js';
import { PROPOSED, SALARY } from './encrypted-fields.js';
import type { FieldCipher } from './field-crypto.js';
import type {
  CriterionResultValue,
  Database,
  LineReviewStatus,
  ProposedKind,
  RequestStatus,
} from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Data for "My increment requests" (R1-10, DASH-D1): counts, requests and employees in a cycle.
 * Everything runs under Row-Level Security in the caller's scope (ADR-002): a subsidiary sees
 * only its own requests, Sirius HR every subsidiary's. This layer returns facts; the API derives
 * completeness and stage with the same rules as the request page (one rule, one place).
 */

export interface DashboardFilter {
  cycleId?: string | undefined;
  /** One subsidiary (Sirius HR's entity filter); Row-Level Security limits it anyway. */
  entityId?: string | undefined;
  status?: RequestStatus | undefined;
  /** Matches anywhere in an employee's name or number, or the request reference. */
  search?: string | undefined;
  /** Drafts are the subsidiary's work in progress: Sirius sees a request once it's submitted. */
  includeDrafts: boolean;
}

interface Page {
  limit: number;
  offset: number;
}

/** Newest first (the lists), or oldest first ("Needs your action": longest waiting first). */
export type DashboardOrder = 'newest' | 'oldest';

/** What is saved for one employee and criterion: enough to judge completeness, no content. */
export interface CriterionFacts {
  criterionId: string;
  result: CriterionResultValue | null;
  hasJustification: boolean;
  evidenceCount: number;
}

export interface DashboardRequestRecord {
  id: string;
  reference: string;
  status: RequestStatus;
  entity: { id: string; code: string };
  cycleId: string;
  createdAt: Date;
  statusChangedAt: Date;
  submittedAt: Date | null;
  /** Criteria verified for every employee still pending review (the stage, R1-10). */
  verifiedCriteria: number;
  /** The request's pinned criteria, in display order. */
  criteria: CriterionRecord[];
  /** One entry per live employee (in the order added): facts per criterion, in set order. */
  lines: CriterionFacts[][];
}

export interface DashboardLineRecord {
  id: string;
  request: {
    id: string;
    reference: string;
    status: RequestStatus;
    entityCode: string;
    createdAt: Date;
  };
  employeeNumber: string;
  fullName: string;
  grade: string;
  currency: string;
  /** Decimal string; for deriving the proposed percentage, never shown in lists. */
  currentSalary: string;
  proposedKind: ProposedKind | null;
  proposedValue: string | null;
  criteria: CriterionRecord[];
  /** Facts per criterion, in set order. */
  facts: CriterionFacts[];
  /** The later of the employee's last change and the request's last status change. */
  updatedAt: Date;
  reviewStatus: LineReviewStatus;
}

export interface DashboardSummaryRecord {
  /** Requests per status in the cycle (the KPI cards): ignores the status and search filters. */
  byStatus: Partial<Record<RequestStatus, number>>;
  /** Requests and employees matching every filter (the tab counts). */
  requests: number;
  employees: number;
}

export interface DashboardRepository {
  summary: (scope: Scope, filter: DashboardFilter) => Promise<DashboardSummaryRecord>;
  requests: (
    scope: Scope,
    query: DashboardFilter & Page & { order?: DashboardOrder | undefined },
  ) => Promise<{ items: DashboardRequestRecord[]; total: number }>;
  lines: (
    scope: Scope,
    query: DashboardFilter & Page & { requestId?: string | undefined },
  ) => Promise<{ items: DashboardLineRecord[]; total: number }>;
}

type Trx = Transaction<Database>;
type Condition = RawBuilder<boolean>;

/** `%text%` for LIKE, with the user's own %, _ and \ taken literally. */
export function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}

/** Conditions on the request (alias `r`) other than search; parameterised, never concatenated. */
function requestConditions(filter: DashboardFilter, withStatus = true): Condition[] {
  const conditions: Condition[] = [sql<boolean>`r.deleted_at is null`];
  if (!filter.includeDrafts) conditions.push(sql<boolean>`r.status <> 'draft'`);
  if (filter.cycleId !== undefined) conditions.push(sql<boolean>`r.cycle_id = ${filter.cycleId}`);
  if (filter.entityId !== undefined) {
    conditions.push(sql<boolean>`r.entity_id = ${filter.entityId}`);
  }
  if (withStatus && filter.status !== undefined) {
    conditions.push(sql<boolean>`r.status = ${filter.status}`);
  }
  return conditions;
}

/** An employee (alias given) matches by name or number; lower() on both sides, Unicode-aware. */
function lineMatches(alias: 'l' | 'sl', pattern: string): Condition {
  const name = sql.ref(`${alias}.full_name`);
  const number = sql.ref(`${alias}.employee_number`);
  return sql<boolean>`(lower(${name}) like lower(${pattern}) or lower(${number}) like lower(${pattern}))`;
}

/** A request matches by its reference or any of its live employees. */
function requestSearch(search: string | undefined): Condition[] {
  if (search === undefined) return [];
  const pattern = containsPattern(search);
  return [
    sql<boolean>`(lower(r.reference) like lower(${pattern}) or exists (
      select 1 from increments.request_line sl
      where sl.request_id = r.id and sl.deleted_at is null and ${lineMatches('sl', pattern)}))`,
  ];
}

/** An employee row matches by its own name or number, or its request's reference. */
function lineSearch(search: string | undefined): Condition[] {
  if (search === undefined) return [];
  const pattern = containsPattern(search);
  return [
    sql<boolean>`(${lineMatches('l', pattern)} or lower(r.reference) like lower(${pattern}))`,
  ];
}

function all(conditions: readonly Condition[]): Condition {
  return sql<boolean>`(${sql.join(conditions, sql` and `)})`;
}

/** Every condition on an employee row (alias `l`, its request `r`): filters, search, request. */
export function lineConditions(
  filter: DashboardFilter & { requestId?: string | undefined },
): Condition {
  const conditions = [
    sql<boolean>`l.deleted_at is null`,
    ...requestConditions(filter),
    ...lineSearch(filter.search),
  ];
  if (filter.requestId !== undefined) {
    conditions.push(sql<boolean>`l.request_id = ${filter.requestId}`);
  }
  return all(conditions);
}

/**
 * Criteria verified for every employee still pending review, per request (alias `r`): the
 * review stage, "Criterion n of 5" (R1-10). Same rule as the review repository.
 */
const VERIFIED_CRITERIA = sql<number>`(select count(*)::int from increments.criterion c
  where c.criteria_set_id = r.criteria_set_id and not exists (
    select 1 from increments.request_line vl
    where vl.request_id = r.id and vl.deleted_at is null and vl.review_status = 'pending'
      and not exists (select 1 from increments.criterion_verification v
                      where v.line_id = vl.id and v.criterion_id = c.id)))`;

const EMPTY_FACTS = { result: null, hasJustification: false, evidenceCount: 0 } as const;

/** Saved results and live file counts for the given lines, by line and criterion. */
async function loadFacts(
  trx: Trx,
  lineIds: readonly string[],
): Promise<(lineId: string, criteria: readonly CriterionRecord[]) => CriterionFacts[]> {
  const saved = new Map<string, Omit<CriterionFacts, 'criterionId'>>();
  if (lineIds.length > 0) {
    const results = await trx
      .selectFrom('increments.criterion_result')
      .select([
        'line_id',
        'criterion_id',
        'result',
        sql<boolean>`justification is not null`.as('has_justification'),
      ])
      .where('line_id', 'in', lineIds)
      .execute();
    const files = await trx
      .selectFrom('increments.evidence_file')
      .select(['line_id', 'criterion_id', (eb) => eb.fn.countAll<string>().as('n')])
      .where('line_id', 'in', lineIds)
      .where('deleted_at', 'is', null)
      .groupBy(['line_id', 'criterion_id'])
      .execute();
    for (const row of results) {
      saved.set(`${row.line_id}:${row.criterion_id}`, {
        result: row.result,
        hasJustification: row.has_justification,
        evidenceCount: 0,
      });
    }
    for (const row of files) {
      const key = `${row.line_id}:${row.criterion_id}`;
      saved.set(key, { ...(saved.get(key) ?? EMPTY_FACTS), evidenceCount: Number(row.n) });
    }
  }
  return (lineId, criteria) =>
    criteria.map((criterion) => ({
      criterionId: criterion.id,
      ...(saved.get(`${lineId}:${criterion.id}`) ?? EMPTY_FACTS),
    }));
}

export function createDashboardRepository(
  db: Kysely<Database>,
  cipher: FieldCipher,
): DashboardRepository {
  return {
    summary: (scope, filter) =>
      withScope(db, scope, async (trx) => {
        const statuses = await trx
          .selectFrom('increments.increment_request as r')
          .select(['r.status', (eb) => eb.fn.countAll<string>().as('n')])
          .where(all(requestConditions(filter, false)))
          .groupBy('r.status')
          .execute();
        const requests = await trx
          .selectFrom('increments.increment_request as r')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where(all([...requestConditions(filter), ...requestSearch(filter.search)]))
          .executeTakeFirstOrThrow();
        const employees = await trx
          .selectFrom('increments.request_line as l')
          .innerJoin('increments.increment_request as r', 'r.id', 'l.request_id')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where(lineConditions(filter))
          .executeTakeFirstOrThrow();
        return {
          byStatus: Object.fromEntries(statuses.map((row) => [row.status, Number(row.n)])),
          requests: Number(requests.n),
          employees: Number(employees.n),
        };
      }),

    requests: (scope, query) =>
      withScope(db, scope, async (trx) => {
        const where = all([...requestConditions(query), ...requestSearch(query.search)]);
        const total = await trx
          .selectFrom('increments.increment_request as r')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where(where)
          .executeTakeFirstOrThrow();
        const rows = await trx
          .selectFrom('increments.increment_request as r')
          .innerJoin('core.entity as e', 'e.id', 'r.entity_id')
          .select([
            'r.id',
            'r.reference',
            'r.status',
            'r.entity_id',
            'e.code as entity_code',
            'r.cycle_id',
            'r.criteria_set_id',
            'r.created_at',
            'r.status_changed_at',
            'r.submitted_at',
            VERIFIED_CRITERIA.as('verified_criteria'),
          ])
          .where(where)
          .orderBy('r.created_at', query.order === 'oldest' ? 'asc' : 'desc')
          .orderBy('r.id')
          .limit(query.limit)
          .offset(query.offset)
          .execute();
        const lines =
          rows.length === 0
            ? []
            : await trx
                .selectFrom('increments.request_line')
                .select(['id', 'request_id'])
                .where(
                  'request_id',
                  'in',
                  rows.map((row) => row.id),
                )
                .where('deleted_at', 'is', null)
                .orderBy('created_at')
                .orderBy('id')
                .execute();
        const sets = await loadCriteriaSets(
          trx,
          rows.map((row) => row.criteria_set_id),
        );
        const factsOf = await loadFacts(
          trx,
          lines.map((line) => line.id),
        );
        return {
          total: Number(total.n),
          items: rows.map((row) => {
            const criteria = sets.of(row.criteria_set_id);
            return {
              id: row.id,
              reference: row.reference,
              status: row.status,
              entity: { id: row.entity_id, code: row.entity_code },
              cycleId: row.cycle_id,
              createdAt: row.created_at,
              statusChangedAt: row.status_changed_at,
              submittedAt: row.submitted_at,
              verifiedCriteria: row.verified_criteria,
              criteria,
              lines: lines
                .filter((line) => line.request_id === row.id)
                .map((line) => factsOf(line.id, criteria)),
            };
          }),
        };
      }),

    lines: (scope, query) =>
      withScope(db, scope, async (trx) => {
        const where = lineConditions(query);
        const total = await trx
          .selectFrom('increments.request_line as l')
          .innerJoin('increments.increment_request as r', 'r.id', 'l.request_id')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where(where)
          .executeTakeFirstOrThrow();
        const rows = await trx
          .selectFrom('increments.request_line as l')
          .innerJoin('increments.increment_request as r', 'r.id', 'l.request_id')
          .innerJoin('core.entity as e', 'e.id', 'r.entity_id')
          .select([
            'l.id',
            'l.request_id',
            'r.reference',
            'r.status',
            'e.code as entity_code',
            'r.created_at as request_created_at',
            'r.criteria_set_id',
            'l.employee_number',
            'l.full_name',
            'l.grade',
            'l.currency',
            'l.current_salary',
            'l.proposed_kind',
            'l.proposed_value',
            'l.review_status',
            sql<Date>`greatest(l.updated_at, r.status_changed_at)`.as('updated_at'),
          ])
          .where(where)
          .orderBy('r.created_at', 'desc')
          .orderBy('r.id')
          .orderBy('l.created_at')
          .orderBy('l.id')
          .limit(query.limit)
          .offset(query.offset)
          .execute();
        const sets = await loadCriteriaSets(
          trx,
          rows.map((row) => row.criteria_set_id),
        );
        const factsOf = await loadFacts(
          trx,
          rows.map((row) => row.id),
        );
        return {
          total: Number(total.n),
          items: rows.map((row) => {
            const criteria = sets.of(row.criteria_set_id);
            return {
              id: row.id,
              request: {
                id: row.request_id,
                reference: row.reference,
                status: row.status,
                entityCode: row.entity_code,
                createdAt: row.request_created_at,
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
              facts: factsOf(row.id, criteria),
              updatedAt: row.updated_at,
              reviewStatus: row.review_status,
            };
          }),
        };
      }),
  };
}
