import { NotificationFilterSchema } from '@peopleforge/contracts';
import { Button, Card, EmptyState, PageHeader, Pagination, ToggleGroup } from '@peopleforge/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { NotificationList } from '@/components/notifications/notification-list';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { NOTIFICATION_FILTERS, notificationRows, notificationsHref } from '@/lib/notification-view';
import { pageCount, paginationLabels } from '@/lib/pagination';
import { roleLabel } from '@/lib/viewer-display';
import { listNotifications } from '@/server/notifications';
import { requireViewer } from '@/server/session';
import { markAllReadAction } from './actions';

interface NotificationsPageProps {
  searchParams: Promise<{ filter?: string; page?: string }>;
}

const Page = z.coerce.number().int().min(1).max(10_000).catch(1);

/** Figma "Notifications" (R1-07, R1-13): the signed-in user's status changes and actions. */
export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const query = await searchParams;
  const filter = NotificationFilterSchema.catch('all').parse(query.filter);
  const page = Page.parse(query.page);

  const result = await listNotifications(filter, page);
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind !== 'ok') throw new Error('Notification API unavailable');
  const { data } = result;
  const pages = pageCount(data.total, data.pageSize);
  const number = new Intl.NumberFormat(locale);

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('notifications.heading')}
        description={t('notifications.intro')}
        actions={
          <form action={markAllReadAction}>
            <input type="hidden" name="filter" value={filter} />
            <Button type="submit" variant="secondary" disabled={data.unread === 0}>
              {t('notifications.markAllRead')}
            </Button>
          </form>
        }
      />
      <Card className="mt-6">
        <div className="flex flex-col gap-4 p-4">
          <ToggleGroup
            variant="pills"
            as={Link}
            label={t('notifications.filterLabel')}
            items={NOTIFICATION_FILTERS.map((item) => ({
              href: notificationsHref(item),
              label:
                item === 'unread'
                  ? `${t('notifications.filters.unread')} (${number.format(data.unread)})`
                  : t(`notifications.filters.${item}`),
              active: item === filter,
            }))}
          />
          {data.items.length === 0 ? (
            <EmptyState
              icon="bell"
              title={t('notifications.emptyTitle')}
              description={t('notifications.emptyBody')}
            />
          ) : (
            <NotificationList
              rows={notificationRows(data, locale, t)}
              label={t('notifications.listLabel')}
              viewLabel={t('notifications.view')}
              unreadLabel={t('notifications.unreadMark')}
            />
          )}
          {pages > 1 ? (
            <Pagination
              page={page}
              pageCount={pages}
              hrefFor={(target) => notificationsHref(filter, target)}
              as={Link}
              labels={paginationLabels('notifications', page, pages, locale, t)}
            />
          ) : null}
        </div>
      </Card>
    </>
  );
}
