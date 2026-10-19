import { FLAG_STATUSES } from '@peopleforge/contracts';
import {
  Alert,
  Badge,
  Breadcrumb,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
} from '@peopleforge/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { FlagForm } from '@/components/group/flag-form';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatDateTime } from '@/lib/format';
import {
  activityText,
  flagBadge,
  flagDetails,
  flagHref,
  flagSubject,
  flagsHref,
  formatPeriod,
  GROUP_ERROR_KEYS,
  ruleDescription,
  ruleName,
  uploadHref,
} from '@/lib/group-view';
import { getFlag, required } from '@/server/group-data';
import { requireViewer } from '@/server/session';

interface FlagPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Figma "Flag detail" (R2-10, R2-11): what was found, the values (with compensation access),
 * owner, status and resolution note, "Send reminder" for Sirius HR, and the flag's activity.
 * Figma wording fixed: "Send reminder".
 */
export default async function FlagPage({ params }: FlagPageProps) {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('employee_data:read')) notFound();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const { flag, activity, owners, previousId, nextId } = required(await getFlag(id.data));
  const badge = flagBadge(flag.status, t);
  const details = flagDetails(flag, locale, t);
  const superseded = flag.resolvedReason === 'superseded';
  const canWork = me.permissions.includes('anomaly:resolve') && !superseded;
  const subject = flagSubject(flag, t);
  const ownerChoices = [
    ...owners,
    ...(owners.some((owner) => owner.id === me.userId)
      ? []
      : [{ id: me.userId, name: t('group.flag.me') }]),
  ];

  return (
    <>
      <div className="mb-3 text-xs text-ink-muted">
        <Breadcrumb
          label={t('breadcrumb.label')}
          as={Link}
          items={[
            {
              label: t('group.quality.heading'),
              href: flagsHref({ period: flag.period, entity: undefined, page: 1 }),
            },
            { label: flag.reference },
          ]}
        />
      </div>
      <PageHeader
        title={`${flag.reference} · ${subject}`}
        description={`${flag.ruleCode} · ${ruleName(flag.ruleKind, t)} · ${flag.entity.code} · ${formatPeriod(flag.period, locale)}`}
        actions={
          <>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {previousId === null ? null : (
              <ButtonLink href={flagHref(previousId)} variant="secondary" size="sm" as={Link}>
                {t('group.flag.previous')}
              </ButtonLink>
            )}
            {nextId === null ? null : (
              <ButtonLink href={flagHref(nextId)} variant="secondary" size="sm" as={Link}>
                {t('group.flag.next')}
              </ButtonLink>
            )}
          </>
        }
      />
      {superseded ? (
        <Alert className="mt-6" tone="info" title={t('group.flag.superseded')} />
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card label={t('group.flag.found')}>
            <CardHeader
              title={t('group.flag.found')}
              description={ruleDescription(flag.ruleKind, flag.detail.threshold ?? null, t)}
            />
            <dl className="grid grid-cols-2 gap-4 px-4 pt-4 pb-6 sm:grid-cols-3 sm:px-6">
              {details.map((item) => (
                <div key={item.id} data-testid={`detail-${item.id}`}>
                  <dt className="text-xs text-ink-muted">{item.label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">{item.value}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-ink-muted">{t('group.flag.upload')}</dt>
                <dd className="mt-1">
                  <Link
                    href={uploadHref(flag.upload.id)}
                    className="font-semibold text-brand-600 hover:underline"
                  >
                    {flag.upload.reference}
                  </Link>
                </dd>
              </div>
            </dl>
            {details.length === 0 && flag.employeeName !== null ? (
              <p className="px-4 pb-6 text-sm text-ink-muted sm:px-6">{t('group.flag.noValues')}</p>
            ) : null}
          </Card>
          <Card label={t('group.flag.workTitle')}>
            <CardHeader
              title={t('group.flag.workTitle')}
              description={t('group.flag.owner', { name: flag.owner.name })}
            />
            <div className="px-4 pt-4 pb-6 sm:px-6">
              {canWork ? (
                <FlagForm
                  flagId={flag.id}
                  ownerId={flag.owner.id}
                  status={flag.status}
                  note={flag.note ?? ''}
                  owners={ownerChoices.map((owner) => ({ value: owner.id, label: owner.name }))}
                  statuses={FLAG_STATUSES.map((status) => ({
                    value: status,
                    label: flagBadge(status, t).label,
                  }))}
                  canRemind={me.scope === 'group' && flag.status !== 'resolved'}
                  messages={GROUP_ERROR_KEYS.map((key) => [key, t(key)] as const)}
                  labels={{
                    form: t('group.flag.workTitle'),
                    owner: t('group.flag.ownerLabel'),
                    status: t('group.quality.status'),
                    note: t('group.flag.note'),
                    noteHint: t('group.flag.noteHint'),
                    save: t('group.flag.save'),
                    saving: t('group.flag.saving'),
                    saved: t('group.flag.saved'),
                    remind: t('group.flag.remind'),
                    reminding: t('group.flag.reminding'),
                    reminded: t('group.flag.reminded'),
                  }}
                />
              ) : (
                <p className="text-sm text-ink">{flag.note ?? t('group.flag.noNote')}</p>
              )}
            </div>
          </Card>
        </div>
        <Card label={t('group.flag.activity')}>
          <CardHeader title={t('group.flag.activity')} />
          <ol className="flex flex-col gap-4 px-4 pt-4 pb-6 sm:px-6">
            {activity.map((entry, index) => (
              <li key={`${entry.at}:${String(index)}`} className="border-s-2 border-line ps-3">
                <p className="text-sm text-ink">{activityText(entry, t)}</p>
                <p className="text-xs text-ink-muted">
                  {`${entry.actorName ?? t('group.flag.system')} · ${formatDateTime(entry.at, locale)}`}
                </p>
              </li>
            ))}
            {flag.resolvedReason === 'superseded' && flag.resolvedAt !== null ? (
              <li className="border-s-2 border-line ps-3">
                <p className="text-sm text-ink">{t('group.flag.supersededActivity')}</p>
                <p className="text-xs text-ink-muted">{formatDateTime(flag.resolvedAt, locale)}</p>
              </li>
            ) : null}
          </ol>
        </Card>
      </div>
    </>
  );
}
