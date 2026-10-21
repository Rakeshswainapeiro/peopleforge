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
import {
  ALWAYS_REQUIRED,
  FieldTypeSchema,
  MAX_CRITERIA,
  RULE_THRESHOLD_UNIT,
  THRESHOLD_OPERATORS,
  THRESHOLD_UNITS,
} from '@peopleforge/contracts';
import { RuleForm } from '@/components/group/rule-form';
import { TemplateEditor } from '@/components/group/template-editor';
import { GROUP_ERROR_KEYS, ruleDescription, ruleName } from '@/lib/group-view';
import { getAnomalyRules, getTemplateSettings } from '@/server/group-data';

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
  const groupConfig = me.permissions.includes('template:configure');
  const [criteria, rules, template, anomalyRules] = await Promise.all([
    getCriteriaSettings().then(required),
    getReminderRules().then(required),
    groupConfig ? getTemplateSettings().then(required) : null,
    groupConfig ? getAnomalyRules().then(required) : null,
  ]);
  const groupMessages = GROUP_ERROR_KEYS.map((key) => [key, t(key)] as const);
  const unitLabel = (unit: 'percent' | 'months' | null | undefined) =>
    unit === 'percent' ? '%' : unit === 'months' ? t('group.settings.months') : null;
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
            maxCriteria={MAX_CRITERIA}
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
              passesOn: t('settings.passesOn'),
              passModes: [
                { value: '', label: t('settings.passModes.manual') },
                ...THRESHOLD_OPERATORS.map((operator) => ({
                  value: operator,
                  label: t(`settings.passModes.${operator}`),
                })),
              ],
              thresholdValue: t('settings.thresholdValue'),
              thresholdValueHint: t('settings.thresholdValueHint'),
              thresholdUnit: t('settings.thresholdUnit'),
              units: THRESHOLD_UNITS.map((unit) => ({
                value: unit,
                label: t(`settings.units.${unit}`),
              })),
              newCriterion: t('settings.newCriterion'),
              addCriterion: t('settings.addCriterion'),
              // The client fills in each criterion's code.
              removeCriterion: t('settings.removeCriterion', { code: '{code}' }),
              removeNew: t('settings.removeNew'),
              limit: t('settings.limit', { max: String(MAX_CRITERIA) }),
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
      {template === null ? null : (
        <Card className="mt-6" label={t('group.settings.templateTitle')}>
          <CardHeader
            title={t('group.settings.templateTitle')}
            description={t('group.settings.templateIntro', {
              version: String(template.version),
              date: template.activatedAt === null ? '—' : formatDate(template.activatedAt, locale),
            })}
          />
          <div className="px-4 pt-4 pb-6 sm:px-6">
            <TemplateEditor
              version={template.version}
              fields={template.fields.map((field) => ({
                key: field.key,
                labelEn: field.label.en,
                labelAr: field.label.ar ?? '',
                type: field.type,
                required: field.required,
                allowed: field.allowedValues.join(', '),
                palmHr: field.palmHrField ?? '',
                core: field.core,
                locked: (ALWAYS_REQUIRED as readonly string[]).includes(field.key),
              }))}
              types={FieldTypeSchema.options.map((type) => ({
                value: type,
                label: t(`group.settings.types.${type}`),
              }))}
              messages={groupMessages}
              labels={{
                form: t('group.settings.templateTitle'),
                key: t('group.settings.key'),
                labelEn: t('group.settings.labelEn'),
                labelAr: t('group.settings.labelAr'),
                type: t('group.settings.type'),
                required: t('group.settings.required'),
                allowed: t('group.settings.allowed'),
                palmHr: t('group.settings.palmHr'),
                remove: t('group.settings.remove'),
                add: t('group.settings.add'),
                note: t('group.settings.templateNote', { next: String(template.version + 1) }),
                publish: t('group.settings.publish', { next: String(template.version + 1) }),
                publishing: t('settings.publishing'),
                published: t('group.settings.published'),
              }}
            />
          </div>
        </Card>
      )}
      {anomalyRules === null ? null : (
        <Card className="mt-6" label={t('group.settings.rulesTitle')}>
          <CardHeader
            title={t('group.settings.rulesTitle')}
            description={t('group.settings.rulesIntro')}
          />
          <div className="px-4 pb-2 sm:px-6">
            {anomalyRules.map((rule) => (
              <RuleForm
                key={rule.code}
                code={rule.code}
                threshold={rule.threshold}
                enabled={rule.enabled}
                unit={unitLabel(RULE_THRESHOLD_UNIT.get(rule.kind))}
                messages={groupMessages}
                labels={{
                  title: ruleName(rule.kind, t),
                  body: ruleDescription(rule.kind, rule.threshold, t),
                  changed:
                    rule.updatedByName === null
                      ? t('settings.defaultValue')
                      : t('settings.lastChanged', {
                          name: rule.updatedByName,
                          date: formatDateTime(rule.updatedAt, locale),
                        }),
                  on: t('settings.reminderOn'),
                  threshold: t('group.settings.threshold'),
                  save: t('settings.save'),
                  saving: t('settings.saving'),
                  saved: t('settings.saved'),
                }}
              />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
