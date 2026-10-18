import { sql, type Kysely } from 'kysely';
import { recordAudit } from './audit.js';
import type { ReportDownload } from './reports.js';
import type { Database, MessageSide, RequestStatus } from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Facts for turnaround time (R1-11, DASH-D3) and back-and-forth (R1-12, DASH-D4): when each
 * submitted request started and ended, when each criterion was verified and since when it was
 * waiting, each return and its resubmission, and when questions and answers were posted. Times
 * only — no pay, no text. The API turns them into measures (ADR-006).
 */

export interface AnalyticsFilter {
  cycleId?: string | undefined;
  entityId?: string | undefined;
}

export interface AnalyticsRequestFact {
  id: string;
  reference: string;
  entityId: string;
  entityCode: string;
  status: RequestStatus;
  employees: number;
  submittedAt: Date;
  decidedAt: Date | null;
}

export interface VerificationFact {
  requestId: string;
  lineId: string;
  code: string;
  position: number;
  /** When the criterion started waiting for Sirius HR: submission, or the resubmission after a return. */
  waitingSince: Date;
  verifiedAt: Date;
}

export interface ReturnFact {
  requestId: string;
  lineId: string;
  returnedAt: Date;
  /** When it came back to Sirius HR; null while still with the subsidiary. */
  resubmittedAt: Date | null;
}

export interface MessageFact {
  requestId: string;
  lineId: string;
  side: MessageSide;
  at: Date;
}

export interface AnalyticsFacts {
  requests: AnalyticsRequestFact[];
  verifications: VerificationFact[];
  returns: ReturnFact[];
  messages: MessageFact[];
}

export interface AnalyticsRepository {
  /** Submitted requests matching the filter, with their review facts (RLS: the caller's). */
  facts: (
    scope: Scope,
    filter: AnalyticsFilter,
    /** Set when the facts become a downloaded report (RP-02): recorded in the audit trail. */
    download?: ReportDownload,
  ) => Promise<AnalyticsFacts>;
}

export function createAnalyticsRepository(db: Kysely<Database>): AnalyticsRepository {
  return {
    facts: (scope, filter, download) =>
      withScope(db, scope, async (trx) => {
        // The submitted requests in scope; every other query is limited to them.
        const conditions = [
          sql<boolean>`r.deleted_at is null`,
          sql<boolean>`r.submitted_at is not null`,
        ];
        if (filter.cycleId !== undefined)
          conditions.push(sql<boolean>`r.cycle_id = ${filter.cycleId}`);
        if (filter.entityId !== undefined) {
          conditions.push(sql<boolean>`r.entity_id = ${filter.entityId}`);
        }
        const where = sql.join(conditions, sql` and `);
        const inScope = sql`(select r.id from increments.increment_request r where ${where})`;

        const requests = await sql<{
          id: string;
          reference: string;
          entity_id: string;
          entity_code: string;
          status: RequestStatus;
          employees: number;
          submitted_at: Date;
          decided_at: Date | null;
        }>`
          select r.id, r.reference, r.entity_id, e.code as entity_code, r.status,
                 (select count(*)::int from increments.request_line l
                   where l.request_id = r.id and l.deleted_at is null) as employees,
                 r.submitted_at, r.decided_at
            from increments.increment_request r
            join core.entity e on e.id = r.entity_id
           where ${where}
           order by r.submitted_at, r.reference`.execute(trx);

        // A criterion of a returned-then-resubmitted employee waits from that resubmission.
        const verifications = await sql<{
          request_id: string;
          line_id: string;
          code: string;
          position: number;
          waiting_since: Date;
          verified_at: Date;
        }>`
          select l.request_id, v.line_id, c.code, c.position, v.verified_at,
                 coalesce(
                   (select max(se.at) from increments.status_event se
                     where se.request_id = l.request_id and se.from_status = 'returned'
                       and se.at <= v.verified_at
                       and exists (select 1 from increments.line_decision d
                                    where d.line_id = v.line_id and d.decision = 'returned'
                                      and d.decided_at < se.at)),
                   r.submitted_at) as waiting_since
            from increments.criterion_verification v
            join increments.request_line l on l.id = v.line_id and l.deleted_at is null
            join increments.increment_request r on r.id = l.request_id
            join increments.criterion c on c.id = v.criterion_id
           where l.request_id in ${inScope}
           order by v.verified_at`.execute(trx);

        // Each return ends at the next time the request left "returned": the resubmission.
        const returns = await sql<{
          request_id: string;
          line_id: string;
          returned_at: Date;
          resubmitted_at: Date | null;
        }>`
          select d.request_id, d.line_id, d.decided_at as returned_at,
                 (select min(se.at) from increments.status_event se
                   where se.request_id = d.request_id and se.from_status = 'returned'
                     and se.at > d.decided_at) as resubmitted_at
            from increments.line_decision d
           where d.decision = 'returned' and d.request_id in ${inScope}
           order by d.decided_at`.execute(trx);

        const messages = await trx
          .selectFrom('increments.line_message')
          .select(['request_id', 'line_id', 'side', 'created_at'])
          .where(sql<boolean>`request_id in ${inScope}`)
          .orderBy('created_at')
          .orderBy('id')
          .execute();

        if (download !== undefined) {
          await recordAudit(trx, scope.userId, {
            action: 'report.downloaded',
            entityId: filter.entityId ?? null,
            subjectType: 'report',
            subjectId: download.report,
            details: {
              format: download.format,
              rows: requests.rows.length,
              cycleId: filter.cycleId ?? null,
            },
          });
        }

        return {
          requests: requests.rows.map((row) => ({
            id: row.id,
            reference: row.reference,
            entityId: row.entity_id,
            entityCode: row.entity_code,
            status: row.status,
            employees: row.employees,
            submittedAt: row.submitted_at,
            decidedAt: row.decided_at,
          })),
          verifications: verifications.rows.map((row) => ({
            requestId: row.request_id,
            lineId: row.line_id,
            code: row.code,
            position: row.position,
            waitingSince: row.waiting_since,
            verifiedAt: row.verified_at,
          })),
          returns: returns.rows.map((row) => ({
            requestId: row.request_id,
            lineId: row.line_id,
            returnedAt: row.returned_at,
            resubmittedAt: row.resubmitted_at,
          })),
          messages: messages.map((row) => ({
            requestId: row.request_id,
            lineId: row.line_id,
            side: row.side,
            at: row.created_at,
          })),
        };
      }),
  };
}
