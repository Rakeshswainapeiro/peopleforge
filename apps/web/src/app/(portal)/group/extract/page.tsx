import { Button, Card, CardHeader, Field, PageHeader, Select } from '@peopleforge/ui';
import { notFound } from 'next/navigation';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import {
  entityChoices,
  extractState,
  GROUP_EXTRACT_PATH,
  periodOptions,
  type SearchParams,
} from '@/lib/group-view';
import { roleLabel } from '@/lib/viewer-display';
import { requireViewer } from '@/server/session';

interface ExtractPageProps {
  searchParams?: Promise<SearchParams>;
}

/**
 * RP-08 raw data extract (R2-08, R2-14) for Sirius HR (`employee_data:extract_raw`): the rows as
 * uploaded with subsidiary, uploader, time and version, as Excel, CSV or a Palm HR–compatible
 * CSV. A plain GET form to the download route; every extraction is in the audit trail.
 */
export default async function ExtractPage({ searchParams }: ExtractPageProps = {}) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:extract_raw')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const state = extractState((await searchParams) ?? {}, new Date());
  const formats = [
    { value: 'xlsx', label: t('group.extract.formats.xlsx') },
    { value: 'csv', label: t('group.extract.formats.csv') },
    { value: 'palmhr', label: t('group.extract.formats.palmhr') },
  ];
  const entities = entityChoices(me.entities, t);

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('group.extract.heading')}
        description={t('group.extract.intro')}
      />
      <Card className="mt-6" label={t('group.extract.formTitle')}>
        <CardHeader title={t('group.extract.formTitle')} description={t('group.extract.note')} />
        <form
          method="get"
          action={`${GROUP_EXTRACT_PATH}/download`}
          aria-label={t('group.extract.formTitle')}
          className="grid gap-4 px-4 pt-4 pb-6 sm:px-6 md:grid-cols-4 md:items-end"
        >
          <Field label={t('group.month')}>
            {(ids) => (
              <Select id={ids.id} name="period" defaultValue={state.period}>
                {periodOptions(new Date(), locale).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('group.subsidiary')}>
            {(ids) => (
              <Select id={ids.id} name="entity" defaultValue={state.entity ?? ''}>
                {entities.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('group.extract.format')}>
            {(ids) => (
              <Select id={ids.id} name="format" defaultValue={state.format}>
                {formats.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name="allVersions"
              value="true"
              defaultChecked={state.allVersions}
              className="size-4 rounded accent-brand-600"
            />
            {t('group.extract.allVersions')}
          </label>
          <div className="md:col-span-4">
            <Button type="submit" icon="download">
              {t('group.extract.download')}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
