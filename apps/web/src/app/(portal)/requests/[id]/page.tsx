import { Alert, Button, Card, CardHeader, PageHeader } from '@peopleforge/ui';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { AddEmployeeForm } from '@/components/requests/add-employee-form';
import { ProposalsTable } from '@/components/requests/proposals-table';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { hasAnyPermission } from '@/lib/navigation';
import { parseErrorKey } from '@/lib/request-errors';
import { proposalRows, saveMessages, tableLabels, totalsView } from '@/lib/request-view';
import { entityName, roleLabel } from '@/lib/viewer-display';
import { getRequest, searchEmployees } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import { addEmployeeAction } from '../actions';

interface RequestPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}

const FORM_ID = 'proposals-form';

/** A draft increment request: employees, proposed increments and totals (R1-02). */
export default async function RequestPage({ params, searchParams }: RequestPageProps) {
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

  const editable = me.permissions.includes('increment_request:create');
  const employees = editable ? await searchEmployees(request.entity.id, request.id) : undefined;
  const entity = entityName(request.entity, locale);
  const totals = totalsView(request, locale, t);
  const error = parseErrorKey(query.error);

  return (
    <>
      <PageHeader
        eyebrow={t('request.draftEyebrow', {
          role: t(roleLabel(me.roles)),
          reference: request.reference,
        })}
        title={t('request.newTitle')}
        description={t('request.newIntro', { count: request.criteria.length })}
        actions={
          editable && request.lines.length > 0 ? (
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
          description={t('request.employeesHint', { entity })}
          actions={
            employees === undefined ? undefined : employees.kind === 'ok' &&
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
            // A new version (after a save) starts the form afresh.
            key={request.version}
            formId={FORM_ID}
            requestId={request.id}
            version={request.version}
            editable={editable}
            rows={proposalRows(request, locale, t)}
            labels={tableLabels(t)}
            messages={saveMessages(t)}
            footer={
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="text-ink-muted">{t('request.totalsEmployees')}</dt>
                  <dd className="font-semibold tabular-nums">{totals.employees}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted">{t('request.totalsIncrease')}</dt>
                  <dd className="font-semibold tabular-nums" data-testid="total-increase">
                    {totals.increase}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted">{t('request.totalsAverage')}</dt>
                  <dd className="font-semibold tabular-nums" data-testid="average-percent">
                    {totals.average}
                  </dd>
                </div>
              </dl>
            }
          />
        </div>
      </Card>
    </>
  );
}
