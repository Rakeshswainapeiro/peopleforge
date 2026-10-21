import {
  FINAL_STATUSES,
  ROLES,
  type DecideLine,
  type DecideRemaining,
  type LineDecisionValue,
  type IncrementRequest,
  type ResubmitRequest,
  type ReviewQueuePage,
  type ReviewQueueQuery,
} from '@peopleforge/contracts';
import type { NewNotification, QueueLineRecord, ReviewRepository } from '@peopleforge/db';
import { scopeOf, type Principal } from '../../auth/principal.js';
import { ValidationError } from '../../errors/domain-errors.js';
import { markOf } from './criteria.js';
import { actorName, guard, type IncrementRequestService } from './increment-request.service.js';
import { lineFigures, toMoney } from './money.js';
import { stageOf } from './stage.js';

const DAY_MS = 86_400_000;

/** Only the subsidiary user who submitted hears about the review; older requests have none. */
function toSubmitter(
  submittedBy: string | null,
  notice: Omit<NewNotification, 'recipient'>,
): NewNotification[] {
  return submittedBy === null ? [] : [{ ...notice, recipient: { userId: submittedBy } }];
}

function toQueueItem(
  record: QueueLineRecord,
  overdueBefore: Date,
): ReviewQueuePage['items'][number] {
  const figures = lineFigures(record.currentSalary, record.proposedKind, record.proposedValue);
  return {
    lineId: record.lineId,
    request: {
      id: record.request.id,
      reference: record.request.reference,
      status: record.request.status,
      entity: { id: record.request.entityId, code: record.request.entityCode },
      stage: stageOf(
        record.request.status,
        record.criteria.length,
        record.request.verifiedCriteria,
      ),
    },
    employeeNumber: record.employeeNumber,
    fullName: record.fullName,
    grade: record.grade,
    // The list shows the percentage only, never the salary (NFR-PRIV-01).
    proposedPercent: figures?.percent ?? null,
    // What the subsidiary submitted: it was complete, so the mark is the result itself.
    criteria: record.criteria.map((criterion, index) => ({
      criterionId: criterion.id,
      code: criterion.code,
      mark: markOf(record.results.at(index) ?? null, []),
    })),
    verified: record.verified,
    reviewStatus: record.reviewStatus,
    waitingSince: record.waitingSince.toISOString(),
    overdue: record.reviewStatus === 'pending' && record.waitingSince < overdueBefore,
  };
}

/**
 * Sirius HR's review of increment requests (R1-07 … R1-10) and the subsidiary's resubmission
 * of returned employees (R1-08). The route checks the permission; Row-Level Security limits a
 * subsidiary to its own requests; the repository locks and checks the request's state.
 */
export class ReviewService {
  constructor(
    private readonly requests: IncrementRequestService,
    private readonly repository: ReviewRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** "Mark verified" for one criterion of one employee, or undo it. */
  async verify(
    caller: Principal,
    target: { requestId: string; lineId: string; criterionId: string },
    verified: boolean,
  ): Promise<IncrementRequest> {
    await guard(
      this.repository.verify(scopeOf(caller), {
        ...target,
        verified,
        actorName: actorName(caller),
        notifications: (context) =>
          toSubmitter(context.submittedBy, {
            kind: 'stage_changed',
            entityId: context.entityId,
            requestId: context.requestId,
            params: { reference: context.reference, criterion: context.criterion, of: context.of },
          }),
      }),
    );
    return this.requests.get(caller, target.requestId);
  }

  /**
   * Approves, rejects or returns one employee (R1-09). An approval at another percentage is
   * checked against the employee's salary; returning asks the subsidiary for action (R1-08).
   */
  async decide(
    caller: Principal,
    target: { requestId: string; lineId: string },
    input: DecideLine,
    idempotencyKey: string,
  ): Promise<IncrementRequest> {
    const approved =
      input.decision === 'approved' && input.approvedPercent !== undefined
        ? { kind: 'percent' as const, value: toMoney(input.approvedPercent) }
        : null;
    return this.record(caller, target, input, approved, idempotencyKey);
  }

  /**
   * "Decide all remaining" (R1-09): one decision, reason and comment for every employee still
   * waiting, at the proposed increments. Approving needs every criterion verified for each; the
   * submitter hears once, with the number of employees.
   */
  async decideRemaining(
    caller: Principal,
    requestId: string,
    input: DecideRemaining,
    idempotencyKey: string,
  ): Promise<IncrementRequest> {
    return this.record(caller, { requestId, lineId: null }, input, null, idempotencyKey);
  }

  private async record(
    caller: Principal,
    target: { requestId: string; lineId: string | null },
    input: {
      decision: LineDecisionValue;
      reasonCode?: string | undefined;
      comment?: string | undefined;
    },
    approved: { kind: 'percent'; value: string } | null,
    idempotencyKey: string,
  ): Promise<IncrementRequest> {
    await guard(
      this.repository.decide(scopeOf(caller), {
        ...target,
        idempotencyKey,
        decision: input.decision,
        reasonCode: input.reasonCode ?? null,
        comment: input.comment ?? '',
        approved,
        actorName: actorName(caller),
        notifications: (context) => {
          const about = { entityId: context.entityId, requestId: context.requestId };
          return [
            ...toSubmitter(context.submittedBy, {
              ...about,
              ...(target.lineId === null
                ? {
                    kind: `employees_${input.decision}`,
                    params: { reference: context.reference, employees: context.employees },
                  }
                : {
                    kind: `employee_${input.decision}`,
                    params: { reference: context.reference, employee: context.employeeName },
                  }),
              actionNeeded: input.decision === 'returned',
            }),
            ...(FINAL_STATUSES.includes(context.requestStatus)
              ? toSubmitter(context.submittedBy, {
                  ...about,
                  kind: 'request_decided',
                  params: { reference: context.reference, status: context.requestStatus },
                })
              : []),
          ];
        },
      }),
    );
    return this.requests.get(caller, target.requestId);
  }

  /**
   * Sends the returned employees back to Sirius HR (R1-08), once each has a proposal and every
   * criterion complete, as for submitting. Reviewers are told; a repeated key is a replay.
   */
  async resubmit(
    caller: Principal,
    requestId: string,
    input: ResubmitRequest,
    idempotencyKey: string,
  ): Promise<IncrementRequest> {
    const current = await this.requests.get(caller, requestId);
    // Not returned: the repository tells a replay (same key) from a second resubmission.
    if (current.status === 'returned') {
      const incomplete = current.lines.flatMap((line, index) =>
        line.reviewStatus !== 'returned' ||
        (line.proposedValue !== null && line.criteria.every((c) => c.missing.length === 0))
          ? []
          : [{ path: `lines.${String(index)}`, code: 'incomplete' }],
      );
      if (incomplete.length > 0) {
        throw new ValidationError('Returned employees not ready to resubmit', incomplete);
      }
    }
    await guard(
      this.repository.resubmit(scopeOf(caller), requestId, {
        version: input.version,
        idempotencyKey,
        note: input.note,
        notifications: (context) => [
          {
            recipient: { role: ROLES.reviewer },
            kind: 'request_resubmitted',
            entityId: context.entityId,
            requestId: context.requestId,
            params: {
              reference: context.reference,
              employees: context.employees,
              entity: current.entity.code,
              actor: actorName(caller),
            },
            actionNeeded: true,
          },
        ],
      }),
    );
    return this.requests.get(caller, requestId);
  }

  /** The Review queue (R1-07): employees across subsidiaries, with the chips' counts. */
  async queue(caller: Principal, query: ReviewQueueQuery): Promise<ReviewQueuePage> {
    const { page, pageSize, ...filter } = query;
    const scope = scopeOf(caller);
    // The configured trigger (settings, R1-13): the same days the worker reminds after.
    const reminderDays = await this.repository.reminderDays(scope);
    const overdueBefore = new Date(this.now().getTime() - reminderDays * DAY_MS);
    const result = await this.repository.queue(scope, {
      ...filter,
      overdueBefore,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return {
      page,
      pageSize,
      total: result.total,
      counts: result.counts,
      reminderDays,
      items: result.items.map((item) => toQueueItem(item, overdueBefore)),
    };
  }
}
