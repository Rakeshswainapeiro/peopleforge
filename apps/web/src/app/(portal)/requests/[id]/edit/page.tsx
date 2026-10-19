import { MAX_JUSTIFICATION_LENGTH } from '@peopleforge/contracts';
import { Alert, Breadcrumb, Button, Card, CardHeader, PageHeader } from '@peopleforge/ui';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { AddEmployeeForm } from '@/components/requests/add-employee-form';
import { CriteriaEditor } from '@/components/requests/criteria-editor';
import { DraftForm } from '@/components/requests/draft-form';
import { ProposalsTable } from '@/components/requests/proposals-table';
import { ReadyPanel } from '@/components/requests/ready-panel';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { parseErrorKey } from '@/lib/request-errors';
import {
  criteriaCards,
  criteriaLabels,
  linesToSend,
  evidenceMessages,
  proposalRows,
  readyView,
  saveMessages,
  tableLabels,
  totalItems,
} from '@/lib/request-view';
import { decisionSummary } from '@/lib/review-view';
import { requestHref } from '@/lib/routes';
import { entityName } from '@/lib/viewer-display';
import { getRequest, searchEmployees } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import { addEmployeeAction } from '../../actions';

interface EditRequestPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; employee?: string }>;
}

const FORM_ID = 'draft-form';

/**
 * Figma "New increment request": a draft's 1. employees and proposed increments (R1-02),
 * 2. the criteria of one employee at a time (R1-03, R1-04, R1-06) beside 3. who is ready to
 * submit (R1-07). Drafts only, for whoever prepares requests: a submitted request goes to its
 * detail page.
 */
export default async function EditRequestPage({ params, searchParams }: EditRequestPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('increment_request:create')) notFound();
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
  // A draft, or a request with employees returned to fix (R1-08); anything else is read-only.
  const fixing = request.status === 'returned';
  if (request.status !== 'draft' && !fixing) redirect(requestHref(request.id));

  const employees = fixing
    ? { kind: 'skipped' as const }
    : await searchEmployees(request.entity.id, request.id);
  const entity = entityName(request.entity, locale);
  const error = parseErrorKey(query.error);
  // The employee being assessed: the one asked for, else the first (that may change).
  const assessable = linesToSend(request);
  const selected = assessable.find((line) => line.id === query.employee) ?? assessable.at(0);
  const question = selected === undefined ? null : decisionSummary(request, selected, locale, t);

  return (
    <DraftForm
      formId={FORM_ID}
      requestId={request.id}
      version={request.version}
      employee={selected?.id}
      editable
      saveLabel={t('request.saveDraft')}
    >
      <PageHeader
        eyebrow={
          <Breadcrumb
            label={t('breadcrumb.label')}
            as={Link}
            items={[
              { label: t('breadcrumb.myRequests'), href: '/' },
              {
                label: fixing
                  ? t('resubmit.breadcrumb', { reference: request.reference })
                  : t('request.breadcrumbDraft', { reference: request.reference }),
              },
            ]}
          />
        }
        title={fixing ? t('resubmit.title') : t('request.newTitle')}
        description={
          fixing
            ? t('resubmit.intro', { reference: request.reference })
            : t('request.newIntro', { count: request.criteria.length })
        }
        actions={
          request.lines.length > 0 ? (
            <Button type="submit" form={FORM_ID} variant="secondary">
              {t('request.saveDraft')}
            </Button>
          ) : undefined
        }
      />
      {query.saved === '1' ? (
        <Alert tone="success" title={t('request.saved')} className="mt-6" />
      ) : null}
      {error === undefined ? null : (
        <Alert role="alert" tone="danger" title={t(error)} className="mt-6" />
      )}
      <Card className="mt-6" label={t('request.employeesSection')}>
        <CardHeader
          title={t('request.employeesSection')}
          description={fixing ? undefined : t('request.employeesHint', { entity })}
          actions={
            employees.kind === 'skipped' ? undefined : employees.kind === 'ok' &&
              employees.data.length > 0 ? (
              <AddEmployeeForm
                action={addEmployeeAction}
                employees={employees.data}
                hidden={{ requestId: request.id }}
                t={t}
              />
            ) : (
              <p className="max-w-xs text-xs text-ink-muted">
                {t('request.noMoreEmployees', { entity })}
              </p>
            )
          }
        />
        <div className="px-6 pt-4 pb-6">
          <ProposalsTable
            // A new version (after a save) starts the fields afresh.
            key={request.version}
            editable
            removable={!fixing}
            selectedLineId={selected?.id}
            rows={proposalRows(request, locale, t)}
            labels={tableLabels(t)}
            messages={saveMessages(t)}
            totals={totalItems(request, locale, t)}
          />
        </div>
      </Card>
      {/* Figma: the criteria beside "Ready to submit?" on wide screens; stacked otherwise. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {selected === undefined ? null : (
          <Card label={t('request.criteriaSection')}>
            <div id="criteria" className="scroll-mt-6">
              <CardHeader
                title={t('request.criteriaTitle', { name: selected.fullName })}
                description={t('request.criteriaHint')}
              />
            </div>
            <div className="px-6 pt-5 pb-6">
              {question === null ? null : (
                <Alert tone={question.tone} title={question.body} className="mb-5">
                  {question.reason === '' ? null : <p>{question.reason}</p>}
                  {question.comment === '' ? null : (
                    <p className="mt-1 whitespace-pre-line text-ink">{question.comment}</p>
                  )}
                  <p className="mt-1">{question.by}</p>
                </Alert>
              )}
              <CriteriaEditor
                // Afresh after a save, and for each employee.
                key={`${String(request.version)}:${selected.id}`}
                requestId={request.id}
                lineId={selected.id}
                criteria={criteriaCards(request, selected, locale, t)}
                labels={criteriaLabels(t)}
                maxJustification={MAX_JUSTIFICATION_LENGTH}
                messages={evidenceMessages(t)}
                locale={locale}
              />
            </div>
          </Card>
        )}
        {/* Stays in view while the criteria scroll past. */}
        <Card className="lg:sticky lg:top-6" label={t('request.readySection')}>
          <CardHeader title={t('request.readySection')} />
          <div className="px-6 pt-4 pb-6">
            {/* A fresh idempotency key per page view: a double click can't submit twice. */}
            <ReadyPanel {...readyView(request, locale, t, randomUUID())} />
          </div>
        </Card>
      </div>
    </DraftForm>
  );
}
