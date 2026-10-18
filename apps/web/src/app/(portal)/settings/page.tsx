import {
  EvidencePolicySchema,
  MAX_EVIDENCE_FILE_MB,
  MAX_REMINDER_DAYS,
} from '@peopleforge/contracts';
import { Card, CardHeader, PageHeader } from '@peopleforge/ui';
import { notFound, redirect } from 'next/navigation';
import { CriteriaSettingsForm } from '@/components/settings/criteria-settings-form';
import { ReminderRuleForm } from '@/components/settings/reminder-rule-form';
import { getRequestLocale } from '@/i18n/request-locale';
import { createTranslator } from '@/i18n/translator';
import { formatDate, formatDateTime } from '@/lib/format';
import { criteriaFields, SETTINGS_ERROR_KEYS } from '@/lib/settings-view';
import { roleLabel } from '@/lib/viewer-display';
import type { ApiResult } from '@/server/api-client';
import { requireViewer } from '@/server/session';
import { getCriteriaSettings, getReminderRules } from '@/server/settings';

function required<T>(result: ApiResult<T>): T {
  if (result.kind === 'unauthenticated') redirect('/session-ended');
  if (result.kind !== 'ok') throw new Error('Settings API unavailable');
  return result.data;
}

/**
 * Settings (R1-05, R1-13, NFR-CFG-01) for admins (`criteria:configure`): the eligibility
 * criteria, published as versions, and the reminder triggers. No Figma frame (M5, M8): built
 * from the design system.
 */
export default async function SettingsPage() {
  const me = await requireViewer();
  if (me === null) return null;
  if (!me.permissions.includes('criteria:configure')) notFound();
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const [criteria, rules] = await Promise.all([
    getCriteriaSettings().then(required),
    getReminderRules().then(required),
  ]);
  const messages = SETTINGS_ERROR_KEYS.map((key) => [key, t(key)] as const);
  const next = criteria.version + 1;

  return (
    <>
      <PageHeader
        eyebrow={t(roleLabel(me.roles))}
        title={t('settings.heading')}
        description={t('settings.intro')}
      />
      <Card className="mt-6" label={t('settings.criteriaTitle')}>
        <CardHeader
          title={t('settings.criteriaTitle')}
          description={
            criteria.activatedAt === null
              ? t('settings.criteriaIntroNoDate', { version: String(criteria.version) })
              : t('settings.criteriaIntro', {
                  version: String(criteria.version),
                  date: formatDate(criteria.activatedAt, locale),
                })
          }
        />
        <div className="px-4 pt-4 pb-6 sm:px-6">
          <CriteriaSettingsForm
            version={criteria.version}
            criteria={criteriaFields(criteria)}
            maxFileMb={MAX_EVIDENCE_FILE_MB}
            messages={messages}
            labels={{
              nameEn: t('settings.nameEn'),
              nameAr: t('settings.nameAr'),
              descriptionEn: t('settings.descriptionEn'),
              descriptionAr: t('settings.descriptionAr'),
              arabicHint: t('settings.arabicHint'),
              justificationRequired: t('settings.justificationRequired'),
              evidence: t('settings.evidence'),
              maxFileMb: t('settings.maxFileMb'),
              maxFileHint: t('settings.maxFileHint', { max: String(MAX_EVIDENCE_FILE_MB) }),
              policies: EvidencePolicySchema.options.map((policy) => ({
                value: policy,
                label: t(`settings.evidencePolicies.${policy}`),
              })),
              note: t('settings.publishNote', {
                next: String(next),
                version: String(criteria.version),
              }),
              publish: t('settings.publish', { next: String(next) }),
              publishing: t('settings.publishing'),
              // The client fills in the number it was given (RSC props are serialisable only).
              published: t('settings.published', { version: '{version}' }),
            }}
          />
        </div>
      </Card>
      <Card className="mt-6" label={t('settings.remindersTitle')}>
        <CardHeader
          title={t('settings.remindersTitle')}
          description={t('settings.remindersIntro')}
        />
        <div className="px-4 pb-2 sm:px-6">
          {rules.map((rule) => (
            <ReminderRuleForm
              key={rule.kind}
              kind={rule.kind}
              days={rule.days}
              enabled={rule.enabled}
              maxDays={MAX_REMINDER_DAYS}
              messages={messages}
              labels={{
                title: t(`settings.reminders.${rule.kind}.title`),
                body: t(`settings.reminders.${rule.kind}.body`),
                changed:
                  rule.updatedByName === null
                    ? t('settings.defaultValue')
                    : t('settings.lastChanged', {
                        name: rule.updatedByName,
                        date: formatDateTime(rule.updatedAt, locale),
                      }),
                on: t('settings.reminderOn'),
                days: t('settings.days'),
                save: t('settings.save'),
                saving: t('settings.saving'),
                saved: t('settings.saved'),
              }}
            />
          ))}
        </div>
      </Card>
    </>
  );
}
