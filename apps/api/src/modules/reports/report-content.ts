import type { LineReviewStatus, RequestStatus } from '@peopleforge/contracts';
import type { ReportLineRecord } from '@peopleforge/db';
import { figuresOf, lineFigures } from '../increment-requests/money.js';

/**
 * What the increment status report (RP-01, R1-14) says, before it is laid out as Excel or PDF:
 * one row per request and one per employee, with TAT and the decided figures. Pure, so the
 * arithmetic is tested once for both formats.
 */

const DAY_MS = 86_400_000;

/** Calendar days from submission to the final decision, or to now while open (S5a default). */
export function tatDays(
  submittedAt: Date | null,
  decidedAt: Date | null,
  now: Date,
): number | null {
  if (submittedAt === null) return null;
  return Math.max(0, Math.floor(((decidedAt ?? now).getTime() - submittedAt.getTime()) / DAY_MS));
}

export interface RequestRow {
  reference: string;
  entityCode: string;
  status: RequestStatus;
  employees: number;
  byStatus: Record<LineReviewStatus, number>;
  submittedAt: Date | null;
  decidedAt: Date | null;
  tatDays: number | null;
}

export interface EmployeeRow {
  reference: string;
  entityCode: string;
  requestStatus: RequestStatus;
  submittedAt: Date | null;
  decidedAt: Date | null;
  tatDays: number | null;
  employeeNumber: string;
  fullName: string;
  grade: string;
  currency: string;
  proposedPercent: string | null;
  /** As approved; null until approved. */
  approvedPercent: string | null;
  /** Approved increase once approved, the proposal while open, none when rejected. */
  increase: string | null;
  reviewStatus: LineReviewStatus;
}

export interface ReportContent {
  requests: RequestRow[];
  employees: EmployeeRow[];
  /** Requests per status (every status, zero when none). */
  counts: Record<RequestStatus, number>;
  truncated: boolean;
}

function employeeRow(line: ReportLineRecord, now: Date): EmployeeRow {
  const proposed = lineFigures(line.currentSalary, line.proposedKind, line.proposedValue);
  const decision = line.decision;
  const approved =
    decision?.decision !== 'approved'
      ? null
      : decision.approved === null
        ? proposed
        : figuresOf(line.currentSalary, decision.approved.kind, decision.approved.value);
  return {
    reference: line.request.reference,
    entityCode: line.request.entityCode,
    requestStatus: line.request.status,
    submittedAt: line.request.submittedAt,
    decidedAt: line.request.decidedAt,
    tatDays: tatDays(line.request.submittedAt, line.request.decidedAt, now),
    employeeNumber: line.employeeNumber,
    fullName: line.fullName,
    grade: line.grade,
    currency: line.currency,
    proposedPercent: proposed?.percent ?? null,
    approvedPercent: approved?.percent ?? null,
    increase:
      line.reviewStatus === 'rejected'
        ? null
        : line.reviewStatus === 'approved'
          ? (approved?.increase ?? null)
          : (proposed?.increase ?? null),
    reviewStatus: line.reviewStatus,
  };
}

export function reportContent(
  lines: readonly ReportLineRecord[],
  truncated: boolean,
  now: Date,
): ReportContent {
  const employees = lines.map((line) => employeeRow(line, now));
  // One row per request, in the order the lines came (subsidiary, then reference).
  const groups = new Map<
    string,
    { request: ReportLineRecord['request']; lines: ReportLineRecord[] }
  >();
  for (const line of lines) {
    const group = groups.get(line.request.id) ?? { request: line.request, lines: [] };
    group.lines.push(line);
    groups.set(line.request.id, group);
  }
  const requests = [...groups.values()].map(({ request, lines: group }): RequestRow => {
    const lineCount = (status: LineReviewStatus) =>
      group.filter((line) => line.reviewStatus === status).length;
    return {
      reference: request.reference,
      entityCode: request.entityCode,
      status: request.status,
      employees: group.length,
      byStatus: {
        pending: lineCount('pending'),
        approved: lineCount('approved'),
        rejected: lineCount('rejected'),
        returned: lineCount('returned'),
      },
      submittedAt: request.submittedAt,
      decidedAt: request.decidedAt,
      tatDays: tatDays(request.submittedAt, request.decidedAt, now),
    };
  });
  const count = (status: RequestStatus) => requests.filter((row) => row.status === status).length;
  return {
    requests,
    employees,
    counts: {
      draft: count('draft'),
      submitted: count('submitted'),
      under_review: count('under_review'),
      returned: count('returned'),
      approved: count('approved'),
      partly_approved: count('partly_approved'),
      rejected: count('rejected'),
    },
    truncated,
  };
}
