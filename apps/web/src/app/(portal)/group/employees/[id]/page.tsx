import { Badge, Breadcrumb, Card, CardHeader, PageHeader } from '@peopleforge/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ChangeList } from '@/components/group/group-tables';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatDateTime } from '@/lib/format';
import {
  fieldName,
  formatPeriod,
  GROUP_EMPLOYEES_PATH,
  uploadBadge,
  uploadHref,
} from '@/lib/group-view';
import { getEmployeeHistory, getTemplate, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface HistoryPageProps {
  params: Promise<{ id: string }>;
}

/**
 * One employee's record over time (R2-04, R2-13): every month and version kept, newest first,
 * with what changed from the version before. Pay changes are shown only with compensation access.
 */
export default async function EmployeeHistoryPage({ params }: HistoryPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:read')) notFound();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const [history, template] = await Promise.all([
    getEmployeeHistory(id.data).then(required),
    getTemplate().then(required),
  ]);
  const labels = new Map(
    template.fields.map((field) => [
      field.key,
      locale === 'ar' && field.label.ar !== undefined ? field.label.ar : field.label.en,
    ]),
  );
  const number = new Intl.NumberFormat(locale);
  const [latest] = history.versions;

  return (
    <>
      <div className="mb-3 text-xs text-ink-muted">
        <Breadcrumb
          label={t('breadcrumb.label')}
          as={Link}
          items={[
            { label: t('group.employees.heading'), href: GROUP_EMPLOYEES_PATH },
            { label: history.employeeNumber },
          ]}
        />
      </div>
      <PageHeader
        title={latest === undefined ? history.employeeNumber : latest.record.fullName}
        description={t('group.history.intro', {
          number: history.employeeNumber,
          entity: history.entity.code,
          count: number.format(history.versions.length),
        })}
      />
      <ol className="mt-6 flex flex-col gap-4" aria-label={t('group.history.list')}>
        {history.versions.map((version, index) => {
          const badge = uploadBadge(version.upload.status, t);
          const title = t('group.history.versionTitle', {
            period: formatPeriod(version.period, locale),
            version: number.format(version.upload.version),
          });
          return (
            <li key={`${version.upload.id}:${String(index)}`}>
              <Card label={title}>
                <CardHeader
                  title={title}
                  description={t('group.history.uploaded', {
                    name: version.upload.uploadedByName,
                    date: formatDateTime(version.upload.uploadedAt, locale),
                  })}
                  actions={
                    <>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      <Link
                        href={uploadHref(version.upload.id)}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        {version.upload.reference}
                      </Link>
                    </>
                  }
                />
                <div className="px-4 pb-4 sm:px-6">
                  {index === history.versions.length - 1 ? (
                    <p className="text-sm text-ink-muted">{t('group.history.first')}</p>
                  ) : version.changes.length === 0 ? (
                    <p className="text-sm text-ink-muted">{t('group.history.unchanged')}</p>
                  ) : (
                    <ChangeList
                      changes={version.changes.map((change) => ({
                        field: fieldName(change.field, labels),
                        before: change.before ?? '—',
                        after: change.after ?? '—',
                      }))}
                      labels={{
                        caption: title,
                        field: t('group.history.field'),
                        before: t('group.history.before'),
                        after: t('group.history.after'),
                      }}
                    />
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}
