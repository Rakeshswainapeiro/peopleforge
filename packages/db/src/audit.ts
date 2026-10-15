import type { Transaction } from 'kysely';
import type { Database } from './schema.js';

/**
 * One action for the audit trail (R1-15, NFR-AUD-01, ADR-011). Written in the same transaction
 * as the change it records, so a change without its audit row can't commit. `details` names
 * what changed — counts, IDs, statuses — never salaries, justifications or file contents.
 */
export interface AuditEntry {
  /** Dotted verb, e.g. `increment_request.submitted`, `evidence.downloaded`. */
  action: string;
  entityId: string | null;
  subjectType: string;
  subjectId: string;
  details?: Record<string, string | number | boolean | null>;
}

export async function recordAudit(
  trx: Transaction<Database>,
  actor: string,
  entry: AuditEntry,
): Promise<void> {
  await trx
    .insertInto('audit.audit_log')
    .values({
      actor,
      action: entry.action,
      entity_id: entry.entityId,
      subject_type: entry.subjectType,
      subject_id: entry.subjectId,
      details: JSON.stringify(entry.details ?? {}),
      correlation_id: null,
    })
    .execute();
}
