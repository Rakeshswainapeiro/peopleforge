import type { AuditEvent, AuditTrailPage } from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type { Translate } from '@/i18n/translator';
import { formatDateTime } from './format';
import { isWorded } from './history-view';

/**
 * The Audit trail page (R1-15, NFR-AUD-01): its state lives in the URL, and entries become rows
 * in words. Entries hold IDs, codes and counts only, never pay or message text.
 */

export interface AuditState {
  search?: string | undefined;
  /** One user's actions (their user ID). */
  actor?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
}

export interface AuditRowView {
  id: string;
  when: string;
  who: string;
  actor: string;
  action: string;
  subject: string;
  details: string;
  /** The link showing only this person's actions. */
  onlyHref: string;
}

type Params = Readonly<Record<string, string | string[] | undefined>>;

const PageNumber = z.coerce.number().int().min(1).max(10_000);
const Day = z.iso.date();
const Search = z.string().trim().min(1).max(100);
const Actor = z.string().trim().min(1).max(128);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the URL; anything unrecognised is dropped rather than failing the page. */
export function auditState(params: Params): AuditState {
  const search = Search.safeParse(first(params.q));
  const actor = Actor.safeParse(first(params.actor));
  const from = Day.safeParse(first(params.from));
  const to = Day.safeParse(first(params.to));
  const page = PageNumber.safeParse(first(params.page));
  return {
    search: search.success ? search.data : undefined,
    actor: actor.success ? actor.data : undefined,
    from: from.success ? from.data : undefined,
    to: to.success ? to.data : undefined,
    page: page.success ? page.data : 1,
  };
}

/** A link to the page with some of its state changed; changing a filter goes back to page 1. */
export function auditHref(state: AuditState, change: Partial<AuditState> = {}): string {
  const next = { ...state, page: 1, ...change };
  const query = new URLSearchParams();
  if (next.search !== undefined) query.set('q', next.search);
  if (next.actor !== undefined) query.set('actor', next.actor);
  if (next.from !== undefined) query.set('from', next.from);
  if (next.to !== undefined) query.set('to', next.to);
  if (next.page > 1) query.set('page', String(next.page));
  const search = query.toString();
  return search === '' ? '/audit' : `/audit?${search}`;
}

/** An action's name in words, or its code when it has none. */
export function actionName(action: string, t: Translate): string {
  return isWorded(action) ? t(`audit.actionNames.${action}`) : action;
}

/** Details as "key: value" pairs, in a stable order. */
export function detailText(details: AuditEvent['details']): string {
  return Object.entries(details)
    .filter(([, value]) => value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

export function auditRows(
  page: AuditTrailPage,
  state: AuditState,
  locale: Locale,
  t: Translate,
): AuditRowView[] {
  return page.items.map((event) => ({
    id: event.id,
    when: formatDateTime(event.at, locale),
    who: event.actorName ?? t('history.someone'),
    actor: event.actor,
    action: actionName(event.action, t),
    subject: `${event.subjectType} · ${event.subjectId}`,
    details: detailText(event.details),
    onlyHref: auditHref(state, { actor: event.actor }),
  }));
}
