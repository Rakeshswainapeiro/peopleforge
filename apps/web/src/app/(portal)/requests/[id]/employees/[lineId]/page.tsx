import { IN_REVIEW_STATUSES, MAX_COMMENT_LENGTH, type MessageSide } from '@peopleforge/contracts';
import {
  Alert,
  Badge,
  Breadcrumb,
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
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifyAction } from '@/app/(portal)/review/actions';
import { MessageForm } from '@/components/conversations/message-form';
import { MessageThread } from '@/components/conversations/message-thread';
import { RequestProgress } from '@/components/requests/request-progress';
import { DecisionPanel } from '@/components/review/decision-panel';
import { VerifyToggle } from '@/components/review/verify-toggle';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { awaitingLabel, messageViews } from '@/lib/conversation-view';
import { criterionRows, employeeCards } from '@/lib/employee-status-view';
import { formatDate } from '@/lib/format';
import { hasAnyPermission } from '@/lib/navigation';
import { parseErrorKey } from '@/lib/request-errors';
import { employeeBadge } from '@/lib/request-status';
import { saveMessages } from '@/lib/request-view';
import {
  decisionPanelLabels,
  decisionSummary,
  inReview,
  nextPending,
  reasonOptions,
  verificationView,
} from '@/lib/review-view';
import { editRequestHref, employeeStatusHref, requestHref } from '@/lib/routes';
import { entityName } from '@/lib/viewer-display';
import { getThread } from '@/server/conversations';
import { getRequest } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';

interface EmployeeStatusPageProps {
  params: Promise<{ id: string; lineId: string }>;
  searchParams: Promise<{ decided?: string; error?: string }>;
}

const Id = z.uuid();
const Decided = z.enum(['approved', 'rejected', 'returned']);

/**
 * Figma "Employee status" and "Review employee" (R1-06 … R1-10): one employee's increment, the
 * criteria as submitted and where the request stands. Sirius HR reviewers also verify each
 * criterion and decide the employee here; everyone sees the decision once made. Access is the
 * request's (another subsidiary's, or a draft for Sirius HR, is "not found").
 */
export default async function EmployeeStatusPage({
  params,
  searchParams,
}: EmployeeStatusPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!hasAnyPermission(me.permissions, ['increment_request:read'])) notFound();
  const { id, lineId } = await params;
  if (!Id.safeParse(id).success || !Id.safeParse(lineId).success) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const query = await searchParams;

  const [result, thread] = await Promise.all([getRequest(id), getThread(id, lineId)]);
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind === 'error' && result.status === 404) notFound();
  if (result.kind !== 'ok') throw new Error('Increment request API unavailable');
  const request = result.data;
  const line = request.lines.find((entry) => entry.id === lineId);
  if (line === undefined) notFound();

  const group = me.scope === 'group';
  const reviewer = me.permissions.includes('increment_request:review');
  const decider = me.permissions.includes('increment_request:decide');
  const open = inReview(request, line);
  const status = employeeBadge(request.status, line.reviewStatus, group, t);
  const entity = entityName(request.entity, locale);
  const rows = criterionRows(request, line, locale, t);
  const editable =
    request.status === 'draft' && me.permissions.includes('increment_request:create');
  const answerable =
    line.reviewStatus === 'returned' && me.permissions.includes('increment_request:submit');
  const summary = decisionSummary(request, line, locale, t);
  const decided = Decided.safeParse(query.decided);
  const next = nextPending(request, line.id);
  const error = parseErrorKey(query.error);
  // Questions and answers (R1-08): visible once submitted; posted while in review, by each side.
  const mySide: MessageSide = group ? 'sirius' : 'subsidiary';
  const canPost =
    (group ? reviewer : me.permissions.includes('increment_request:submit')) &&
    IN_REVIEW_STATUSES.includes(request.status);
  const messages = thread.kind === 'ok' ? thread.data : [];
  const waiting = awaitingLabel(messages, mySide, request.entity.code, t);
  const back = reviewer
    ? { href: '/review', label: t('decision.backToQueue') }
    : { href: '/', label: t('employeeStatus.back') };

  return (
    <>
      <PageHeader
        eyebrow={
          <Breadcrumb
            label={t('breadcrumb.label')}
            as={Link}
            items={[
              reviewer
                ? { label: t('review.breadcrumb'), href: '/review' }
                : { label: t('breadcrumb.myRequests'), href: '/' },
              { label: request.reference, href: requestHref(request.id) },
              { label: line.fullName },
            ]}
          />
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
            <ButtonLink href={back.href} variant="secondary" icon="arrow-start" as={Link}>
              {back.label}
            </ButtonLink>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        }
      />

      {error === undefined ? null : (
        <Alert role="alert" tone="danger" title={t(error)} className="mt-6" />
      )}

      {decided.success && reviewer ? (
        <Alert
          role="status"
          tone="success"
          title={t(`decision.saved.${decided.data}`, { name: line.fullName, entity })}
          className="mt-6"
          actions={
            next === undefined ? (
              <ButtonLink href="/review" variant="outline" size="sm" as={Link}>
                {t('decision.backToQueue')}
              </ButtonLink>
            ) : (
              <ButtonLink
                href={employeeStatusHref(request.id, next.id)}
                size="sm"
                trailingIcon="chevron-end"
                as={Link}
              >
                {t('decision.next', { name: next.fullName })}
              </ButtonLink>
            )
          }
        >
          {next === undefined ? t('decision.allDone', { reference: request.reference }) : null}
        </Alert>
      ) : null}

      {summary === null ? (
        request.submittedAt === null ? (
          <Alert
            tone="warning"
            title={t('employeeStatus.draftTitle')}
            className="mt-6"
            actions={
              editable ? (
                <ButtonLink
                  href={editRequestHref(request.id)}
                  variant="outline"
                  size="sm"
                  as={Link}
                >
                  {t('dashboard.continueDraft')}
                </ButtonLink>
              ) : undefined
            }
          >
            {t('employeeStatus.draftBody')}
          </Alert>
        ) : reviewer ? null : (
          <Alert tone="info" title={t('request.waitingTitle')} className="mt-6">
            {t('request.waitingBody', { date: formatDate(request.submittedAt, locale) })}
          </Alert>
        )
      ) : (
        <Alert
          tone={summary.tone}
          title={summary.title}
          className="mt-6"
          actions={
            answerable ? (
              <ButtonLink
                href={editRequestHref(request.id, { employee: line.id })}
                variant="outline"
                size="sm"
                as={Link}
              >
                {t('requestDetail.update')}
              </ButtonLink>
            ) : undefined
          }
        >
          <p>{summary.body}</p>
          {summary.reason === '' ? null : <p className="mt-1">{summary.reason}</p>}
          {summary.comment === '' ? null : (
            <blockquote className="mt-2 border-s-2 border-current/30 ps-3 whitespace-pre-line">
              {summary.comment}
            </blockquote>
          )}
          <p className="mt-2 text-xs opacity-80">{summary.by}</p>
        </Alert>
      )}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {employeeCards(line, locale, t).map((card) => (
          <li key={card.label}>
            <StatCard {...card} />
          </li>
        ))}
      </ul>

      <div
        className={
          reviewer && decider && open
            ? 'mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]'
            : 'mt-6'
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          <RequestProgress request={request} locale={locale} t={t} />

          <Card label={t('employeeStatus.criteriaTitle')}>
            <div id="criteria" className="scroll-mt-6">
              <CardHeader
                title={t('employeeStatus.criteriaTitle')}
                description={
                  reviewer && open
                    ? t('review.criteriaIntro', { entity, name: line.fullName })
                    : me.scope === 'entity'
                      ? t('employeeStatus.criteriaIntro', { name: line.fullName })
                      : t('employeeStatus.criteriaIntroGroup', { entity, name: line.fullName })
                }
              />
            </div>
            <div className="px-6 pt-2 pb-6">
              <Table caption={t('employeeStatus.criteriaCaption', { name: line.fullName })}>
                <THead>
                  <tr>
                    <Th>{t('employeeStatus.colCriterion')}</Th>
                    <Th>{t('employeeStatus.colResult')}</Th>
                    <Th>{t('employeeStatus.colJustification')}</Th>
                    <Th>{t('employeeStatus.colEvidence')}</Th>
                    {request.submittedAt === null ? null : <Th>{t('review.colVerification')}</Th>}
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => {
                    const check = verificationView(line, row.id, row.code, locale, t);
                    return (
                      <Tr key={row.id}>
                        <Td className="font-semibold">{row.name}</Td>
                        <Td>
                          <Badge tone={row.result.tone} icon={row.result.icon}>
                            {row.result.label}
                          </Badge>
                          {row.measured === null ? null : (
                            <span className="mt-1 block text-xs text-ink-muted">
                              {row.measured}
                            </span>
                          )}
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
                        {request.submittedAt === null ? null : (
                          <Td>
                            <div className="flex flex-col items-start gap-1.5">
                              <Badge
                                tone={check.verified ? 'success' : 'outline'}
                                icon={check.verified ? 'check' : undefined}
                              >
                                {check.verified ? t('review.verified') : check.text}
                              </Badge>
                              {check.verified ? (
                                <span className="text-xs text-ink-muted">{check.text}</span>
                              ) : null}
                              {reviewer && open ? (
                                <VerifyToggle
                                  action={verifyAction.bind(
                                    null,
                                    request.id,
                                    line.id,
                                    row.id,
                                    !check.verified,
                                  )}
                                  verified={check.verified}
                                  text={check.button}
                                  label={check.buttonLabel}
                                />
                              ) : null}
                            </div>
                          </Td>
                        )}
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </Card>

          {request.submittedAt === null ? null : (
            <Card label={t('conversations.threadTitle')}>
              <div id="conversation" className="scroll-mt-6">
                <CardHeader
                  title={t('conversations.threadTitle')}
                  description={t('conversations.threadIntro', { entity, name: line.fullName })}
                  actions={waiting === null ? undefined : <Badge tone="warning">{waiting}</Badge>}
                />
              </div>
              <div className="flex flex-col gap-5 px-6 pt-4 pb-6">
                <MessageThread
                  messages={messageViews(messages, mySide, request.entity.code, locale, t)}
                  label={t('conversations.threadLabel', { name: line.fullName })}
                  empty={t('conversations.threadEmpty')}
                />
                {canPost ? (
                  <MessageForm
                    requestId={request.id}
                    lineId={line.id}
                    messageKey={randomUUID()}
                    maxLength={MAX_COMMENT_LENGTH}
                    labels={{
                      message: t('conversations.message'),
                      placeholder: group
                        ? t('conversations.askPlaceholder')
                        : t('conversations.answerPlaceholder'),
                      send: t('conversations.send'),
                      sending: t('conversations.sending'),
                      sent: t('conversations.sent'),
                    }}
                    messages={saveMessages(t)}
                  />
                ) : IN_REVIEW_STATUSES.includes(request.status) ? null : (
                  <p className="text-xs text-ink-muted">{t('conversations.closed')}</p>
                )}
              </div>
            </Card>
          )}
        </div>

        {reviewer && decider && open ? (
          <Card className="lg:sticky lg:top-6" label={t('decision.panelTitle')}>
            <CardHeader title={t('decision.panelTitle')} description={t('decision.panelIntro')} />
            <div className="px-6 pt-4 pb-6">
              <DecisionPanel
                requestId={request.id}
                lineId={line.id}
                // A fresh idempotency key per page view: a double click can't decide twice.
                decisionKey={randomUUID()}
                reasons={reasonOptions(t)}
                maxComment={MAX_COMMENT_LENGTH}
                labels={decisionPanelLabels(line, locale, t)}
                messages={saveMessages(t)}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
