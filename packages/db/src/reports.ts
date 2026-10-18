import type { Kysely } from 'kysely';
import { recordAudit } from './audit.js';
import { lineConditions, type DashboardFilter } from './dashboard.js';
import { APPROVED_VALUE, PROPOSED, SALARY } from './encrypted-fields.js';
import type { FieldCipher } from './field-crypto.js';
import type {
  Database,
  LineDecisionValue,
  LineReviewStatus,
  ProposedKind,
  RequestStatus,
} from './schema.js';
import { withScope, type Scope } from './scope.js';

/**
 * Data for the increment reports (R1-14, RP-01): every employee line matching the filters with
 * its request and latest decision. Reading it is the download: it records `report.downloaded`
 * in the same transaction (R1-15, "every download is logged").
 */

export interface ReportLineRecord {
  request: {
    id: string;
    reference: string;
    status: RequestStatus;
    entityCode: string;
    createdAt: Date;
    submittedAt: Date | null;
    decidedAt: Date | null;
  };
  employeeNumber: string;
  fullName: string;
  grade: string;
  currency: string;
  /** Decimal string, to derive percentages and amounts; the report never lists it. */
  currentSalary: string;
  proposedKind: ProposedKind | null;
  proposedValue: string | null;
  reviewStatus: LineReviewStatus;
  /** The latest decision; `approved` is set when approved at another increment. */
  decision: {
    decision: LineDecisionValue;
    approved: { kind: ProposedKind; value: string } | null;
  } | null;
}

export interface ReportDownload {
  /** e.g. `RP-01`. */
  report: string;
  format: 'xlsx' | 'pdf';
}

export interface ReportRepository {
  incrementLines: (
    scope: Scope,
    filter: DashboardFilter,
    download: ReportDownload,
  ) => Promise<{ lines: ReportLineRecord[]; truncated: boolean }>;
}

/** Most employee lines one report holds (a cycle's worth with headroom; NFR-PERF-01). */
export const REPORT_ROW_LIMIT = 20_000;

export function createReportRepository(
  db: Kysely<Database>,
  cipher: FieldCipher,
): ReportRepository {
  return {
    incrementLines: (scope, filter, download) =>
      withScope(db, scope, async (trx) => {
        const rows = await trx
          .selectFrom('increments.request_line as l')
          .innerJoin('increments.increment_request as r', 'r.id', 'l.request_id')
          .innerJoin('core.entity as e', 'e.id', 'r.entity_id')
          .leftJoin(
            (eb) =>
              eb
                .selectFrom('increments.line_decision')
                .distinctOn('line_id')
                .select(['line_id', 'id', 'decision', 'approved_kind', 'approved_value'])
                .orderBy('line_id')
                .orderBy('decided_at', 'desc')
                .as('d'),
            (join) => join.onRef('d.line_id', '=', 'l.id'),
          )
          .select([
            'l.id',
            'l.employee_number',
            'l.full_name',
            'l.grade',
            'l.currency',
            'l.current_salary',
            'l.proposed_kind',
            'l.proposed_value',
            'l.review_status',
            'r.id as request_id',
            'r.reference',
            'r.status',
            'r.created_at',
            'r.submitted_at',
            'r.decided_at',
            'e.code as entity_code',
            'd.id as decision_id',
            'd.decision',
            'd.approved_kind',
            'd.approved_value',
          ])
          .where(lineConditions(filter))
          .orderBy('e.code')
          .orderBy('r.reference')
          .orderBy('l.created_at')
          .limit(REPORT_ROW_LIMIT + 1)
          .execute();
        const truncated = rows.length > REPORT_ROW_LIMIT;
        const kept = rows.slice(0, REPORT_ROW_LIMIT);
        await recordAudit(trx, scope.userId, {
          action: 'report.downloaded',
          entityId: filter.entityId ?? null,
          subjectType: 'report',
          subjectId: download.report,
          details: {
            format: download.format,
            rows: kept.length,
            cycleId: filter.cycleId ?? null,
            status: filter.status ?? null,
            search: filter.search !== undefined,
          },
        });
        return {
          truncated,
          lines: kept.map((row) => ({
            request: {
              id: row.request_id,
              reference: row.reference,
              status: row.status,
              entityCode: row.entity_code,
              createdAt: row.created_at,
              submittedAt: row.submitted_at,
              decidedAt: row.decided_at,
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
            reviewStatus: row.review_status,
            decision:
              row.decision_id === null || row.decision === null
                ? null
                : {
                    decision: row.decision,
                    approved:
                      row.approved_kind === null || row.approved_value === null
                        ? null
                        : {
                            kind: row.approved_kind,
                            value: cipher.decrypt(row.approved_value, {
                              ...APPROVED_VALUE,
                              rowId: row.decision_id,
                            }),
                          },
                  },
          })),
        };
      }),
  };
}
