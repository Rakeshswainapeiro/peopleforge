import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  Select,
  ToggleGroup,
} from '@peopleforge/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { AddEmployeeForm } from '@/components/requests/add-employee-form';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { hasAnyPermission } from '@/lib/navigation';
import { parseErrorKey } from '@/lib/request-errors';
import { entityName, localised, roleLabel } from '@/lib/viewer-display';
import { openCycles, searchEmployees } from '@/server/increment-requests';
import { requireViewer } from '@/server/session';
import { startRequest } from '../actions';

interface NewRequestPageProps {
  searchParams: Promise<{ entity?: string; error?: string }>;
}

/**
 * New increment request (R1-02, Figma "New increment request"). Adding the first employee
 * creates the draft (idempotently) and opens it.
 */
export default async function NewRequestPage({ searchParams }: NewRequestPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!hasAnyPermission(me.permissions, ['increment_request:create'])) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const query = await searchParams;
  const error = parseErrorKey(query.error);

  const header = (
    <PageHeader
      eyebrow={t(roleLabel(me.roles))}
      title={t('request.newTitle')}
      description={t('request.newIntroGeneric')}
    />
  );
  const entity = me.entities.find((candidate) => candidate.id === query.entity) ?? me.entities[0];
  if (entity === undefined) {
    return (
      <>
        {header}
        <Alert tone="warning" title={t('request.noSubsidiaryTitle')} className="mt-6">
          {t('request.noSubsidiaryBody')}
        </Alert>
      </>
    );
  }

  const [cycles, employees] = await Promise.all([openCycles(), searchEmployees(entity.id)]);
  if (cycles.kind === 'unauthenticated' || employees.kind === 'unauthenticated')
    redirect('/session-ended');
  if (cycles.kind !== 'ok' || employees.kind !== 'ok')
    throw new Error('Increment request API unavailable');

  const name = entityName(entity, locale);
  const [onlyCycle] = cycles.data;
  return (
    <>
      {header}
      {me.entities.length > 1 ? (
        <div className="mt-6">
          <ToggleGroup
            label={t('request.subsidiary')}
            variant="pills"
            as={Link}
            items={me.entities.map((candidate) => ({
              href: `/requests/new?entity=${candidate.id}`,
              label: entityName(candidate, locale),
              active: candidate.id === entity.id,
            }))}
          />
        </div>
      ) : null}
      {error === undefined ? null : (
        <Alert role="alert" tone="danger" title={t(error)} className="mt-6" />
      )}
      {onlyCycle === undefined ? (
        <Alert tone="warning" title={t('request.noCycleTitle')} className="mt-6">
          {t('request.noCycleBody')}
        </Alert>
      ) : (
        <Card className="mt-6" label={t('request.employeesSection')}>
          <CardHeader
            title={t('request.employeesSection')}
            description={t('request.employeesHint', { entity: name })}
            actions={
              <AddEmployeeForm
                action={startRequest}
                employees={employees.data}
                t={t}
                hidden={{
                  entityId: entity.id,
                  // A fresh key per page view: a double click creates one draft, not two.
                  idempotencyKey: randomUUID(),
                  ...(cycles.data.length === 1 ? { cycleId: onlyCycle.id } : {}),
                }}
              >
                {cycles.data.length > 1 ? (
                  <Field label={t('request.cycle')} className="w-56">
                    {({ id }) => (
                      <Select id={id} name="cycleId" defaultValue={onlyCycle.id} controlSize="lg">
                        {cycles.data.map((cycle) => (
                          <option key={cycle.id} value={cycle.id}>
                            {localised(cycle.name, locale)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                ) : null}
              </AddEmployeeForm>
            }
          />
          <EmptyState
            icon="file"
            title={t('request.emptyTitle')}
            description={t('request.emptyBody')}
          />
        </Card>
      )}
    </>
  );
}
