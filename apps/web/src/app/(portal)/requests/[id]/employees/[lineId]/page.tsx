import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
  StatCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { RequestProgress } from '@/components/requests/request-progress';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { criterionRows, employeeCards } from '@/lib/employee-status-view';
import { formatDate } from '@/lib/format';
import { hasAnyPermission } from '@/lib/navigation';
import { statusBadge } from '@/lib/request-status';
import { entityName } from '@/lib/viewer-display';
import { getRequest } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';

interface EmployeeStatusPageProps {
  params: Promise<{ id: string; lineId: string }>;
}

const Id = z.uuid();

/**
 * Figma "Employee status" (R1-06, R1-07), opened from "View Status" on the dashboard: one
 * employee's increment, criteria as submitted, and where the request stands. Read-only; access
 * is the request's (another subsidiary's, or a draft for Sirius HR, is "not found").
 */
export default async function EmployeeStatusPage({ params }: EmployeeStatusPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!hasAnyPermission(me.permissions, ['increment_request:read'])) notFound();
  const { id, lineId } = await params;
  if (!Id.safeParse(id).success || !Id.safeParse(lineId).success) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const result = await getRequest(id);
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind === 'error' && result.status === 404) notFound();
  if (result.kind !== 'ok') throw new Error('Increment request API unavailable');
  const request = result.data;
  const line = request.lines.find((entry) => entry.id === lineId);
  if (line === undefined) notFound();

  const status = statusBadge(request.status, t);
  const entity = entityName(request.entity, locale);
  const rows = criterionRows(request, line, locale, t);
  const editable =
    request.status === 'draft' && me.permissions.includes('increment_request:create');

  return (
    <>
      <PageHeader
        eyebrow={
          <nav aria-label={t('employeeStatus.breadcrumb')}>
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link
                  href="/"
                  className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
                >
                  {t('employeeStatus.myRequests')}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">{t('employeeStatus.current')}</li>
            </ol>
          </nav>
        }
        title={line.fullName}
        description={t('employeeStatus.subtitle', {
          number: line.employeeNumber,
          grade: line.grade,
          entity,
          reference: request.reference,
        })}
        actions={
          <div className="flex items-center gap-3">
            <ButtonLink href="/" variant="secondary" icon="arrow-start" as={Link}>
              {t('employeeStatus.back')}
            </ButtonLink>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        }
      />

      {request.submittedAt === null ? (
        <Alert
          tone="warning"
          title={t('employeeStatus.draftTitle')}
          className="mt-6"
          actions={
            editable ? (
              <ButtonLink href={`/requests/${request.id}`} variant="outline" size="sm" as={Link}>
                {t('dashboard.continueDraft')}
              </ButtonLink>
            ) : undefined
          }
        >
          {t('employeeStatus.draftBody')}
        </Alert>
      ) : (
        <Alert tone="info" title={t('request.waitingTitle')} className="mt-6">
          {t('request.waitingBody', { date: formatDate(request.submittedAt, locale) })}
        </Alert>
      )}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {employeeCards(line, locale, t).map((card) => (
          <li key={card.label}>
            <StatCard {...card} />
          </li>
        ))}
      </ul>

      <RequestProgress request={request} locale={locale} t={t} />

      <Card className="mt-6" label={t('employeeStatus.criteriaTitle')}>
        <CardHeader
          title={t('employeeStatus.criteriaTitle')}
          description={
            me.scope === 'entity'
              ? t('employeeStatus.criteriaIntro', { name: line.fullName })
              : t('employeeStatus.criteriaIntroGroup', { entity, name: line.fullName })
          }
        />
        <div className="px-6 pt-2 pb-6">
          <Table caption={t('employeeStatus.criteriaCaption', { name: line.fullName })}>
            <THead>
              <tr>
                <Th>{t('employeeStatus.colCriterion')}</Th>
                <Th>{t('employeeStatus.colResult')}</Th>
                <Th>{t('employeeStatus.colJustification')}</Th>
                <Th>{t('employeeStatus.colEvidence')}</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td className="font-semibold">{row.name}</Td>
                  <Td>
                    <Badge tone={row.result.tone} icon={row.result.icon}>
                      {row.result.label}
                    </Badge>
                  </Td>
                  <Td className="max-w-md text-sm whitespace-pre-line text-ink">
                    {row.justification}
                  </Td>
                  <Td>
                    {row.evidence.length === 0 ? (
                      <span className="text-ink-muted">{t('employeeStatus.none')}</span>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {row.evidence.map((file) => (
                          <li key={file.id}>
                            <a
                              href={file.href}
                              aria-label={file.label}
                              className="text-sm text-brand-600 underline-offset-2 hover:underline"
                            >
                              {file.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
