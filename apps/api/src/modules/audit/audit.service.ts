import type { AuditEvent, AuditTrailPage, AuditTrailQuery } from '@peopleforge/contracts';
import type { AuditEventRecord, AuditTrailRepository } from '@peopleforge/db';
import { scopeOf, type Principal } from '../../auth/principal.js';
import type { IncrementRequestService } from '../increment-requests/increment-request.service.js';

/** Details as clients see them: flat values only (IDs, codes, counts), never nested data. */
function flatDetails(details: Record<string, unknown>): AuditEvent['details'] {
  return Object.fromEntries(
    Object.entries(details).filter(
      (entry): entry is [string, string | number | boolean | null] =>
        entry[1] === null || ['string', 'number', 'boolean'].includes(typeof entry[1]),
    ),
  );
}

function toEvent(record: AuditEventRecord): AuditEvent {
  return {
    id: record.id,
    at: record.at.toISOString(),
    actor: record.actor,
    actorName: record.actorName,
    action: record.action,
    entityId: record.entityId,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    details: flatDetails(record.details),
  };
}

const DAY_MS = 86_400_000;

/**
 * The audit trail (R1-15): one request's history for anyone who can see the request (its own
 * check, then Row-Level Security), and the whole trail per user for `audit:read`.
 */
export class AuditService {
  constructor(
    private readonly requests: IncrementRequestService,
    private readonly repository: AuditTrailRepository,
  ) {}

  async requestHistory(caller: Principal, requestId: string): Promise<AuditEvent[]> {
    // Not found (404) unless the caller may see the request: drafts stay the subsidiary's.
    await this.requests.get(caller, requestId);
    const records = await this.repository.requestHistory(scopeOf(caller), requestId);
    return records.map(toEvent);
  }

  async trail(caller: Principal, query: AuditTrailQuery): Promise<AuditTrailPage> {
    const { items, total } = await this.repository.trail(scopeOf(caller), {
      actor: query.actor,
      search: query.search,
      from: query.from === undefined ? undefined : new Date(`${query.from}T00:00:00+04:00`),
      // Inclusive "to": up to the end of that day in Asia/Dubai.
      to:
        query.to === undefined
          ? undefined
          : new Date(new Date(`${query.to}T00:00:00+04:00`).getTime() + DAY_MS),
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return { page: query.page, pageSize: query.pageSize, total, items: items.map(toEvent) };
  }
}
