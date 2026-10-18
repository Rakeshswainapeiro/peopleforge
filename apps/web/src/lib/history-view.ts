import {
  RequestStatusSchema,
  type AuditEvent,
  type IncrementRequest,
} from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';
import { formatDateTime } from './format';
import { statusBadge } from './request-status';

/**
 * A request's History card (R1-15): audit entries in words. The trail stores IDs and codes only
 * (never pay or message text), so names come from the request itself; anything unknown is shown
 * generically rather than guessed.
 */

export interface HistoryRowView {
  id: string;
  when: string;
  who: string;
  what: string;
}

/** The actions worded in the reader's language; any other is shown as its code. */
export const WORDED_ACTIONS = [
  'increment_request.created',
  'request_line.added',
  'request_line.removed',
  'increment_request.discarded',
  'increment_request.draft_saved',
  'evidence.uploaded',
  'evidence.removed',
  'evidence.downloaded',
  'increment_request.submitted',
  'increment_request.status_changed',
  'criterion.verified',
  'criterion.unverified',
  'request_line.approved',
  'request_line.rejected',
  'request_line.returned',
  'increment_request.resubmitted',
  'message.posted',
  'report.downloaded',
] as const;
export type WordedAction = (typeof WORDED_ACTIONS)[number];

export function isWorded(action: string): action is WordedAction {
  return (WORDED_ACTIONS as readonly string[]).includes(action);
}

function text(value: AuditEvent['details'][string] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The employee an entry is about: by line (files, checks, decisions, messages) or by employee. */
function employeeOf(event: AuditEvent, request: IncrementRequest): string | undefined {
  const lineId =
    text(event.details.lineId) ??
    (event.subjectType === 'request_line' ? event.subjectId : undefined);
  const employeeId = text(event.details.employeeId);
  const line = request.lines.find(
    (candidate) => candidate.id === lineId || candidate.employeeId === employeeId,
  );
  return line?.fullName;
}

function statusLabel(value: AuditEvent['details'][string] | undefined, t: Translate): string {
  const status = RequestStatusSchema.safeParse(value);
  return status.success ? statusBadge(status.data, t).label : String(value ?? '');
}

/** One entry's sentence, in the reader's language. */
export function historyText(
  event: AuditEvent,
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): string {
  const action = event.action;
  if (!isWorded(action)) return action;
  const criterionId = text(event.details.criterionId);
  const number = new Intl.NumberFormat(locale);
  const count = event.details.employees;
  return t(`history.actions.${action}`, {
    employee: employeeOf(event, request) ?? t('history.unknownEmployee'),
    code:
      request.criteria.find((criterion) => criterion.id === criterionId)?.code ??
      t('history.unknownCode'),
    count: typeof count === 'number' ? number.format(count) : '',
    from: statusLabel(event.details.from, t),
    to: statusLabel(event.details.to, t),
    report: event.subjectType === 'report' ? event.subjectId : '',
    format: (text(event.details.format) ?? '').toUpperCase(),
  });
}

/** The card's rows, newest first as the API returns them. */
export function historyRows(
  events: readonly AuditEvent[],
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): HistoryRowView[] {
  return events.map((event) => ({
    id: event.id,
    when: formatDateTime(event.at, locale),
    who: event.actorName ?? t('history.someone'),
    what: historyText(event, request, locale, t),
  }));
}
