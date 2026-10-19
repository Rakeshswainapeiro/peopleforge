import { MAX_UPLOAD_MB, MAX_UPLOAD_ROWS } from '@peopleforge/contracts';
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader } from '@peopleforge/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { UploadForm } from '@/components/group/upload-form';
import { UploadsTable } from '@/components/group/group-tables';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  currentPeriod,
  GROUP_ERROR_KEYS,
  GROUP_UPLOADS_PATH,
  periodBefore,
  periodOptions,
  TEMPLATE_FILE_PATH,
  uploadRows,
} from '@/lib/group-view';
import { roleLabel } from '@/lib/viewer-display';
import { getTemplate, listUploads, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

/**
 * Upload employee data (R2-01) for subsidiary HR (`employee_data:upload`): the template to fill
 * in, the upload itself and the latest uploads. Not designed in Figma yet: built from the design
 * system, to be aligned when the frame arrives.
 */
export default async function UploadPage() {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:upload')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const now = new Date();
  const [template, recent] = await Promise.all([
    getTemplate().then(required),
    listUploads({ page: 1, pageSize: 10 }).then(required),
  ]);
  const number = new Intl.NumberFormat(locale);
  const required_ = template.fields.filter((field) => field.required).length;

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('group.upload.heading')}
        description={t('group.upload.intro')}
        actions={
          <ButtonLink href={TEMPLATE_FILE_PATH} variant="secondary" icon="download">
            {t('group.upload.downloadTemplate')}
          </ButtonLink>
        }
      />
      <Card className="mt-6" label={t('group.upload.formTitle')}>
        <CardHeader
          title={t('group.upload.formTitle')}
          description={t('group.upload.templateNote', {
            version: number.format(template.version),
            date: template.activatedAt === null ? '—' : formatDate(template.activatedAt, locale),
            fields: number.format(template.fields.length),
            required: number.format(required_),
          })}
        />
        <div className="px-4 pt-4 pb-6 sm:px-6">
          <UploadForm
            entities={me.entities.map((entity) => ({ value: entity.id, label: entity.code }))}
            periods={periodOptions(now, locale, 13)}
            period={periodBefore(currentPeriod(now), 1)}
            messages={GROUP_ERROR_KEYS.map((key) => [key, t(key)] as const)}
            labels={{
              form: t('group.upload.formTitle'),
              entity: t('group.subsidiary'),
              period: t('group.month'),
              file: t('group.upload.file'),
              fileHint: t('group.upload.fileHint', {
                mb: number.format(MAX_UPLOAD_MB),
                rows: number.format(MAX_UPLOAD_ROWS),
              }),
              upload: t('group.upload.submit'),
              uploading: t('group.upload.submitting'),
            }}
          />
        </div>
      </Card>
      <Card className="mt-6" label={t('group.upload.recentTitle')}>
        <CardHeader
          title={t('group.upload.recentTitle')}
          actions={
            <Link
              href={GROUP_UPLOADS_PATH}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              {t('group.upload.allUploads')}
            </Link>
          }
        />
        <div className="px-4 pb-4 sm:px-6">
          {recent.items.length === 0 ? (
            <EmptyState
              icon="upload"
              title={t('group.uploads.emptyTitle')}
              description={t('group.uploads.emptyBody')}
            />
          ) : (
            <UploadsTable
              rows={uploadRows(recent.items, locale, t, (iso) => formatDateTime(iso, locale))}
              labels={{
                caption: t('group.upload.recentTitle'),
                upload: t('group.uploads.colUpload'),
                month: t('group.uploads.colMonth'),
                status: t('group.uploads.colStatus'),
                rows: t('group.uploads.colRows'),
                problems: t('group.uploads.colProblems'),
                flags: t('group.uploads.colFlags'),
              }}
            />
          )}
        </div>
      </Card>
    </>
  );
}
