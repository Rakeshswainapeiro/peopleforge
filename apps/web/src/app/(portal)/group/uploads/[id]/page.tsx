import {
  Alert,
  Badge,
  Breadcrumb,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
  StatCard,
} from '@peopleforge/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { IssuesTable } from '@/components/group/group-tables';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatDateTime } from '@/lib/format';
import {
  comparisonItems,
  flagsHref,
  formatPeriod,
  GROUP_UPLOAD_PATH,
  GROUP_UPLOADS_PATH,
  issueRow,
  uploadBadge,
  uploadFileHref,
  uploadIssuesHref,
} from '@/lib/group-view';
import { getTemplate, getUpload, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface UploadPageProps {
  params: Promise<{ id: string }>;
}

/**
 * One upload's result (R2-01, R2-02, R2-09): accepted as a version, with the comparison with the
 * previous month and its flags; or rejected, with every problem by row and column. Problem values
 * are never shown, only where and what (they may be pay or personal data).
 */
export default async function UploadResultPage({ params }: UploadPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:read')) notFound();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const [upload, template] = await Promise.all([
    getUpload(id.data).then(required),
    getTemplate().then(required),
  ]);
  const number = new Intl.NumberFormat(locale);
  const labels = new Map(
    template.fields.map((field) => [
      field.key,
      locale === 'ar' && field.label.ar !== undefined ? field.label.ar : field.label.en,
    ]),
  );
  const badge = uploadBadge(upload.status, t);
  const period = formatPeriod(upload.period, locale);
  // Only a rejected upload has no version (database check).
  const { version } = upload;

  return (
    <>
      <div className="mb-3 text-xs text-ink-muted">
        <Breadcrumb
          label={t('breadcrumb.label')}
          as={Link}
          items={[
            { label: t('group.uploads.heading'), href: GROUP_UPLOADS_PATH },
            { label: upload.reference },
          ]}
        />
      </div>
      <PageHeader
        title={t('group.result.heading', {
          reference: upload.reference,
          entity: upload.entity.code,
          period,
        })}
        description={t('group.result.meta', {
          file: upload.fileName,
          name: upload.uploadedByName,
          date: formatDateTime(upload.uploadedAt, locale),
          template: number.format(upload.templateVersion),
        })}
        actions={
          <>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            <ButtonLink href={uploadFileHref(upload.id)} variant="secondary" icon="download">
              {t('group.result.original')}
            </ButtonLink>
          </>
        }
      />
      {version === null ? (
        <Alert className="mt-6" tone="danger" title={t('group.result.rejectedTitle')}>
          {t('group.result.rejectedBody')}
        </Alert>
      ) : (
        <Alert
          className="mt-6"
          tone="success"
          title={t('group.result.acceptedTitle', {
            version: number.format(version),
          })}
        >
          {upload.status === 'superseded'
            ? t('group.result.supersededBody')
            : t('group.result.acceptedBody')}
        </Alert>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('group.result.rows')} value={number.format(upload.rows)} />
        <StatCard label={t('group.result.errors')} value={number.format(upload.errors)} />
        <StatCard label={t('group.result.warnings')} value={number.format(upload.warnings)} />
        <StatCard label={t('group.result.flags')} value={number.format(upload.flags)} />
      </div>
      {upload.comparison === null ? null : (
        <Card className="mt-6" label={t('group.compare.title')}>
          <CardHeader
            title={t('group.compare.title')}
            description={
              upload.comparison.previousPeriod === null
                ? t('group.compare.first')
                : t('group.compare.against', {
                    period: formatPeriod(upload.comparison.previousPeriod, locale),
                  })
            }
            actions={
              upload.flags === 0 ? undefined : (
                <ButtonLink
                  href={flagsHref({
                    period: upload.period,
                    entity: upload.entity.id,
                    page: 1,
                  })}
                  variant="outline"
                  size="sm"
                  icon="flag"
                  as={Link}
                >
                  {t('group.result.viewFlags', { count: number.format(upload.flags) })}
                </ButtonLink>
              )
            }
          />
          <dl className="grid grid-cols-2 gap-4 px-4 pt-4 pb-6 sm:grid-cols-3 sm:px-6 lg:grid-cols-6">
            {comparisonItems(upload.comparison, locale, t).map((item) => (
              <div key={item.id} data-testid={`compare-${item.id}`}>
                <dt className="text-xs text-ink-muted">{item.label}</dt>
                <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
          {upload.comparison.warnings.length === 0 ? null : (
            <div className="px-4 pb-6 sm:px-6">
              <Alert tone="warning" title={t('group.compare.warningsTitle')}>
                {upload.comparison.warnings
                  .map((warning) => t(`group.compare.warnings.${warning}`))
                  .join(' ')}
              </Alert>
            </div>
          )}
        </Card>
      )}
      {upload.issues.length === 0 ? null : (
        <Card className="mt-6" label={t('group.result.problemsTitle')}>
          <CardHeader
            title={t('group.result.problemsTitle')}
            description={
              upload.issuesTotal > upload.issues.length
                ? t('group.result.problemsMore', {
                    shown: number.format(upload.issues.length),
                    total: number.format(upload.issuesTotal),
                  })
                : t('group.result.problemsIntro')
            }
            actions={
              <ButtonLink
                href={uploadIssuesHref(upload.id)}
                variant="secondary"
                size="sm"
                icon="download"
              >
                {t('group.result.problemsDownload')}
              </ButtonLink>
            }
          />
          <div className="px-4 pb-4 sm:px-6">
            <IssuesTable
              rows={upload.issues.map((issue) => issueRow(issue, labels, locale, t))}
              labels={{
                caption: t('group.result.problemsTitle'),
                where: t('group.result.colWhere'),
                column: t('group.result.colColumn'),
                severity: t('group.result.colSeverity'),
                problem: t('group.result.colProblem'),
              }}
            />
          </div>
        </Card>
      )}
      {version === null && me.permissions.includes('employee_data:upload') ? (
        <div className="mt-6">
          <ButtonLink href={GROUP_UPLOAD_PATH} icon="upload" as={Link}>
            {t('group.result.uploadAgain')}
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}
