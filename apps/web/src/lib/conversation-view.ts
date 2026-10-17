import type {
  ConversationFilter,
  ConversationPage,
  Message,
  MessageSide,
} from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import type { Translate } from '@/i18n/translator';
import { formatDateTime } from './format';
import { employeeStatusHref } from './routes';

/** Questions and answers per employee (R1-08): the thread and the Conversations list. */

/** "Sirius HR", or the subsidiary's code. */
export function sideLabel(side: MessageSide, entity: string, t: Translate): string {
  return side === 'sirius'
    ? t('conversations.sideSirius')
    : t('conversations.sideSubsidiary', { entity });
}

/** Where an employee's conversation is: their page, at the thread. */
export function conversationHref(requestId: string, lineId: string): string {
  return `${employeeStatusHref(requestId, lineId)}#conversation`;
}

export interface MessageView {
  id: string;
  /** Written from the reader's side (shown at the end, in brand colours). */
  mine: boolean;
  /** "Sirius HR · Sara Al Mansoori". */
  by: string;
  at: string;
  body: string;
}

export function messageViews(
  messages: readonly Message[],
  mySide: MessageSide,
  entity: string,
  locale: Locale,
  t: Translate,
): MessageView[] {
  return messages.map((message) => ({
    id: message.id,
    mine: message.side === mySide,
    by: t('conversations.by', {
      side: sideLabel(message.side, entity, t),
      name: message.authorName,
    }),
    at: formatDateTime(message.createdAt, locale),
    body: message.body,
  }));
}

/** Who has to answer the thread now, in words; null when nobody has asked yet. */
export function awaitingLabel(
  messages: readonly Message[],
  mySide: MessageSide,
  entity: string,
  t: Translate,
): string | null {
  const last = messages.at(-1);
  if (last === undefined) return null;
  return last.side === mySide
    ? t('conversations.awaitingThem', {
        side: sideLabel(mySide === 'sirius' ? 'subsidiary' : 'sirius', entity, t),
      })
    : t('conversations.awaitingYou');
}

export function conversationsHref(filter: ConversationFilter, page = 1): string {
  const query = new URLSearchParams();
  if (filter !== 'awaiting') query.set('filter', filter);
  if (page > 1) query.set('page', String(page));
  const search = query.toString();
  return search === '' ? '/conversations' : `/conversations?${search}`;
}

export interface ThreadRowView {
  id: string;
  href: string;
  name: string;
  detail: string;
  request: string;
  entityCode: string;
  by: string;
  preview: string;
  when: string;
  messages: string;
  awaitingMe: boolean;
  action: string;
  actionLabel: string;
}

export function threadRows(page: ConversationPage, locale: Locale, t: Translate): ThreadRowView[] {
  const number = new Intl.NumberFormat(locale);
  return page.items.map((thread) => ({
    id: thread.lineId,
    href: conversationHref(thread.request.id, thread.lineId),
    name: thread.fullName,
    detail: thread.employeeNumber,
    request: thread.request.reference,
    entityCode: thread.request.entityCode,
    by: t('conversations.by', {
      side: sideLabel(thread.last.side, thread.request.entityCode, t),
      name: thread.last.authorName,
    }),
    preview: thread.last.preview,
    when: formatDateTime(thread.last.createdAt, locale),
    messages: number.format(thread.messages),
    awaitingMe: thread.awaitingMe,
    action: thread.awaitingMe ? t('conversations.respond') : t('conversations.open'),
    actionLabel: thread.awaitingMe
      ? t('conversations.respondTo', { name: thread.fullName })
      : t('conversations.openOf', { name: thread.fullName }),
  }));
}
