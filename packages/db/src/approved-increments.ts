import { sql, type Transaction } from 'kysely';
import { APPROVED_VALUE, PROPOSED, SALARY } from './encrypted-fields.js';
import type { FieldCipher } from './field-crypto.js';
import type { Database, ProposedKind } from './schema.js';

/**
 * Employees approved in the Increment Portal (R1), as R2 needs them: to check uploaded
 * salaries against the approved increment (ANM-05) and for the increment distribution and
 * cost impact (DASH-D6, RP-04). The latest decision per employee line, approved only.
 */
export interface ApprovedIncrementRecord {
  entityId: string;
  entityCode: string;
  cycleId: string;
  employeeNumber: string;
  currency: string;
  /** The salary the request was made on (decimal string). */
  currentSalary: string;
  proposedKind: ProposedKind;
  proposedValue: string;
  /** Set when approved at another increment than proposed. */
  approved: { kind: ProposedKind; value: string } | null;
  decidedAt: Date;
}

export interface ApprovedIncrementFilter {
  entityId?: string | undefined;
  cycleId?: string | undefined;
  /** Decided before this instant. */
  before?: Date | undefined;
}

export async function loadApprovedIncrements(
  trx: Transaction<Database>,
  cipher: FieldCipher,
  filter: ApprovedIncrementFilter,
): Promise<ApprovedIncrementRecord[]> {
  // A submitted line always has a proposal; the condition lets the row type say so.
  const conditions = [
    sql<boolean>`d.decision = 'approved'`,
    sql<boolean>`l.deleted_at IS NULL`,
    sql<boolean>`l.proposed_kind IS NOT NULL AND l.proposed_value IS NOT NULL`,
  ];
  if (filter.entityId !== undefined)
    conditions.push(sql<boolean>`r.entity_id = ${filter.entityId}`);
  if (filter.cycleId !== undefined) conditions.push(sql<boolean>`r.cycle_id = ${filter.cycleId}`);
  if (filter.before !== undefined) conditions.push(sql<boolean>`d.decided_at < ${filter.before}`);
  const rows = await sql<{
    line_id: string;
    decision_id: string;
    entity_id: string;
    entity_code: string;
    cycle_id: string;
    employee_number: string;
    currency: string;
    current_salary: Buffer;
    proposed_kind: ProposedKind;
    proposed_value: Buffer;
    approved_kind: ProposedKind;
    approved_value: Buffer | null;
    decided_at: Date;
  }>`
    SELECT l.id AS line_id, d.id AS decision_id, r.entity_id, e.code AS entity_code, r.cycle_id,
           l.employee_number, l.currency, l.current_salary, l.proposed_kind, l.proposed_value,
           -- The kind is only read when a value is set (CHECK: both or neither).
           coalesce(d.approved_kind, l.proposed_kind) AS approved_kind, d.approved_value,
           d.decided_at
      FROM increments.request_line l
      JOIN increments.increment_request r ON r.id = l.request_id
      JOIN core.entity e ON e.id = r.entity_id
      JOIN LATERAL (SELECT * FROM increments.line_decision x
                     WHERE x.line_id = l.id ORDER BY x.decided_at DESC LIMIT 1) d ON true
     WHERE ${sql.join(conditions, sql` AND `)}
     ORDER BY d.decided_at`.execute(trx);
  return rows.rows.map((row) => ({
    entityId: row.entity_id,
    entityCode: row.entity_code,
    cycleId: row.cycle_id,
    employeeNumber: row.employee_number,
    currency: row.currency,
    currentSalary: cipher.decrypt(row.current_salary, { ...SALARY, rowId: row.line_id }),
    proposedKind: row.proposed_kind,
    proposedValue: cipher.decrypt(row.proposed_value, { ...PROPOSED, rowId: row.line_id }),
    approved:
      row.approved_value === null
        ? null
        : {
            kind: row.approved_kind,
            value: cipher.decrypt(row.approved_value, {
              ...APPROVED_VALUE,
              rowId: row.decision_id,
            }),
          },
    decidedAt: row.decided_at,
  }));
}
