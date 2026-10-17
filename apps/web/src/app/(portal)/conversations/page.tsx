import { ConversationFilterSchema, type ConversationFilter } from '@peopleforge/contracts';
import { Card, EmptyState, PageHeader, Pagination, ToggleGroup } from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { ConversationTable } from '@/components/conversations/conversation-table';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { conversationsHref, threadRows } from '@/lib/conversation-view';
import { hasAnyPermission } from '@/lib/navigation';
import { pageCount, paginationLabels } from '@/lib/pagination';
import { roleLabel } from '@/lib/viewer-display';
import { listConversations } from '@/server/conversations';
import { requireViewer } from '@/server/session';

interface ConversationsPageProps {
  searchParams: Promise<{ filter?: string; page?: string }>;
}

const PageNumber = z.coerce.number().int().min(1).max(10_000);

/**
 * Figma "Conversations" (R1-08): every employee with questions between Sirius HR and the
 * subsidiaries, latest first; "Waiting for you" first. Row-Level Security limits a subsidiary
 * to its own.
 */
export default async function ConversationsPage({ searchParams }: ConversationsPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!hasAnyPermission(me.permissions, ['increment_request:review', 'increment_request:submit'])) {
    notFound();
  }
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const query = await searchParams;
  const parsed = ConversationFilterSchema.safeParse(query.filter);
  const filter: ConversationFilter = parsed.success ? parsed.data : 'awaiting';
  const pageNumber = PageNumber.safeParse(query.page);
  const page = pageNumber.success ? pageNumber.data : 1;

  const result = await listConversations({ filter, page });
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind !== 'ok') throw new Error('Conversations unavailable');
  const data = result.data;
  const pages = pageCount(data.total, data.pageSize);
  if (data.total > 0 && page > pages) redirect(conversationsHref(filter, pages));

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('conversations.heading')}
        description={
          me.scope === 'group' ? t('conversations.intro') : t('conversations.introEntity')
        }
      />
      <Card className="mt-6">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <ToggleGroup
            as={Link}
            label={t('conversations.chips')}
            items={ConversationFilterSchema.options.map((option) => ({
              href: conversationsHref(option),
              label: t(`conversations.filters.${option}`),
              count: option === 'awaiting' ? data.counts.awaiting : data.counts.all,
              active: option === filter,
            }))}
          />
          {data.total === 0 ? (
            filter === 'awaiting' ? (
              <EmptyState
                icon="check"
                title={t('conversations.emptyAwaitingTitle')}
                description={t('conversations.emptyAwaitingBody')}
              />
            ) : (
              <EmptyState
                title={t('conversations.emptyTitle')}
                description={t('conversations.emptyBody')}
              />
            )
          ) : (
            <>
              <ConversationTable
                rows={threadRows(data, locale, t)}
                labels={{
                  caption: t('conversations.caption'),
                  employee: t('conversations.colEmployee'),
                  request: t('conversations.colRequest'),
                  last: t('conversations.colLast'),
                  when: t('conversations.colWhen'),
                  messages: t('conversations.colMessages'),
                  action: t('conversations.colAction'),
                  awaiting: t('conversations.awaitingYou'),
                }}
              />
              {pages > 1 ? (
                <Pagination
                  page={page}
                  pageCount={pages}
                  hrefFor={(target) => conversationsHref(filter, target)}
                  as={Link}
                  labels={paginationLabels('conversations', page, pages, locale, t)}
                />
              ) : null}
            </>
          )}
        </div>
      </Card>
    </>
  );
}
