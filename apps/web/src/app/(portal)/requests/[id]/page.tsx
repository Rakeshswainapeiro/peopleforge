import {
  Alert,
  Breadcrumb,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
  ProgressSteps,
  StatCard,
} from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { RequestEmployeesTable } from '@/components/requests/request-employees-table';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { hasAnyPermission } from '@/lib/navigation';
import {
  criteriaColumn,
  detailRows,
  detailSubtitle,
  reviewSteps,
  submittedBanner,
} from '@/lib/request-detail-view';
import { requestFigures } from '@/lib/request-figures';
import { markStateLabels } from '@/lib/request-view';
import { editRequestHref, requestHref } from '@/lib/routes';
import { getRequest } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';

interface RequestDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}

/**
 * Figma "Request detail" (R1-06, R1-07): a submitted request, where it is in Sirius HR's review,
 * its figures and its employees. A draft opens in the editor for whoever prepares requests, and
 * is "not found" for everyone else (Sirius HR sees requests once submitted).
 */
export default async function RequestDetailPage({ params, searchParams }: RequestDetailPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!hasAnyPermission(me.permissions, ['increment_request:read'])) notFound();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const query = await searchParams;

  const result = await getRequest(id);
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind === 'error' && result.status === 404) notFound();
  if (result.kind !== 'ok') throw new Error('Increment request API unavailable');
  const request = result.data;
  const preparer = me.permissions.includes('increment_request:create');
  if (request.status === 'draft') {
    if (preparer) redirect(editRequestHref(request.id));
    notFound();
  }

  const banner = query.submitted === '1' ? submittedBanner(request, locale, t) : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <Breadcrumb
            label={t('breadcrumb.label')}
            as={Link}
            items={[
              { label: t('breadcrumb.myRequests'), href: '/' },
              { label: t('breadcrumb.requestDetail') },
            ]}
          />
        }
        title={request.reference}
        description={detailSubtitle(request, locale, t)}
        actions={
          preparer ? (
            <ButtonLink href="/requests/new" icon="plus" as={Link}>
              {t('dashboard.newRequest')}
            </ButtonLink>
          ) : undefined
        }
      />

      {banner === null ? null : (
        <Alert
          tone="success"
          title={banner.title}
          className="mt-6"
          actions={
            <>
              <ButtonLink href="#employees" variant="outline" size="sm">
                {t('requestDetail.viewEmployees')}
              </ButtonLink>
              {/* Dismissing drops ?submitted=1, so a reload doesn't bring the banner back. */}
              <ButtonLink
                href={requestHref(request.id)}
                variant="ghost"
                size="sm"
                icon="x"
                as={Link}
                aria-label={t('requestDetail.dismiss')}
                className="px-2"
              >
                <span className="sr-only">{t('requestDetail.dismiss')}</span>
              </ButtonLink>
            </>
          }
        >
          {banner.body}
        </Alert>
      )}

      <Card className="mt-6" label={t('requestDetail.whereTitle')}>
        <CardHeader title={t('requestDetail.whereTitle')} />
        <div className="px-6 pt-4 pb-6">
          <ProgressSteps
            label={t('requestDetail.whereTitle')}
            steps={reviewSteps(request, locale, t)}
            stateLabels={{
              done: t('request.progressStates.done'),
              current: t('request.progressStates.current'),
              todo: t('request.progressStates.todo'),
            }}
          />
        </div>
      </Card>

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {requestFigures(request, locale, t).map((figure) => (
          <li key={figure.label}>
            <StatCard {...figure} />
          </li>
        ))}
      </ul>

      <Card className="mt-6" label={t('figures.employees')}>
        <div id="employees" className="scroll-mt-6">
          <CardHeader title={t('figures.employees')} />
        </div>
        <div className="px-6 pt-2 pb-6">
          <RequestEmployeesTable
            rows={detailRows(request, locale, t)}
            labels={{
              caption: t('requestDetail.tableCaption', { reference: request.reference }),
              employee: t('requestDetail.colEmployee'),
              grade: t('requestDetail.colGrade'),
              current: t('requestDetail.colCurrent'),
              proposed: t('requestDetail.colProposed'),
              criteria: criteriaColumn(request, t),
              status: t('requestDetail.colStatus'),
              action: t('requestDetail.colAction'),
              viewStatus: t('dashboard.viewStatus'),
              stateLabels: markStateLabels(t),
            }}
          />
        </div>
      </Card>
    </>
  );
}
