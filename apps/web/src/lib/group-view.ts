import {
  businessDay,
  ExtractFormatSchema,
  FlagStatusSchema,
  PeriodSchema,
  RULE_THRESHOLD_UNIT,
  type ExtractFormat,
  type Flag,
  type FlagStatus,
  type RuleKind,
  type Upload,
  type UploadComparison,
  type UploadIssue,
  type UploadStatus,
} from '@peopleforge/contracts';
import type { BadgeTone } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type { MessageKey, Translate } from '@/i18n/translator';

/**
 * Group employee data pages (R2-01 … R2-14): links, URL state and wording, in one place. Page
 * state lives in the URL; anything unrecognised falls back to its default.
 */

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const Id = z.uuid();
const PageNumber = z.coerce.number().int().min(1).max(10_000);
const Search = z.string().trim().min(1).max(100);
const Department = z.string().trim().min(1).max(80);
const RuleCode = z.string().regex(/^ANM-\d{2}$/u);
/** A signed decimal (flag values, percentages). */
const DecimalText = z.string().regex(/^-?\d+$|^-?\d+\.\d+$/u);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withQuery(path: string, values: Readonly<Record<string, string | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  const text = params.toString();
  return text === '' ? path : `${path}?${text}`;
}

const pageParam = (page: number) => (page > 1 ? String(page) : undefined);

// ---- Links ----

export const GROUP_UPLOAD_PATH = '/group/upload';
export const GROUP_UPLOADS_PATH = '/group/uploads';
export const GROUP_EMPLOYEES_PATH = '/group/employees';
export const GROUP_QUALITY_PATH = '/group/quality';
export const GROUP_EXTRACT_PATH = '/group/extract';
export const TEMPLATE_FILE_PATH = '/group/template';

export const uploadHref = (id: string): string => `${GROUP_UPLOADS_PATH}/${id}`;
export const uploadIssuesHref = (id: string): string => `${GROUP_UPLOADS_PATH}/${id}/issues`;
export const uploadFileHref = (id: string): string => `${GROUP_UPLOADS_PATH}/${id}/file`;
export const employeeHistoryHref = (id: string): string => `${GROUP_EMPLOYEES_PATH}/${id}`;
export const flagHref = (id: string): string => `${GROUP_QUALITY_PATH}/flags/${id}`;

// ---- Months ----

/** The current month in the business time zone: "2026-10". */
export function currentPeriod(now: Date): string {
  return businessDay(now).slice(0, 7);
}

/** "2026-09" minus `months`. */
export function periodBefore(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 - months, 1)).toISOString().slice(0, 7);
}

/** "September 2026" in the reader's language. */
export function formatPeriod(period: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${period}-01T00:00:00Z`));
}

export interface Option {
  value: string;
  label: string;
}

/** The current month and the 23 before it, newest first. */
export function periodOptions(now: Date, locale: Locale, months = 24): Option[] {
  const latest = currentPeriod(now);
  return Array.from({ length: months }, (_, index) => {
    const value = periodBefore(latest, index);
    return { value, label: formatPeriod(value, locale) };
  });
}

/** Subsidiaries for a filter: "All subsidiaries" first when there are several. */
export function entityChoices(
  entities: readonly { id: string; code: string }[],
  t: Translate,
): Option[] {
  const options = entities.map((entity) => ({ value: entity.id, label: entity.code }));
  return entities.length > 1
    ? [{ value: '', label: t('group.allSubsidiaries') }, ...options]
    : options;
}

const periodOf = (value: string | undefined) => PeriodSchema.safeParse(value).data;
const idOf = (value: string | undefined) => Id.safeParse(value).data;

// ---- Uploads ----

export interface UploadsState {
  entity?: string | undefined;
  period?: string | undefined;
  page: number;
}

export function uploadsState(params: SearchParams): UploadsState {
  return {
    entity: idOf(first(params.entity)),
    period: periodOf(first(params.period)),
    page: PageNumber.safeParse(first(params.page)).data ?? 1,
  };
}

export function uploadsHref(state: UploadsState, change: Partial<UploadsState> = {}): string {
  const next = { ...state, page: 1, ...change };
  return withQuery(GROUP_UPLOADS_PATH, {
    entity: next.entity,
    period: next.period,
    page: pageParam(next.page),
  });
}

const uploadTone = (status: UploadStatus): BadgeTone =>
  status === 'accepted' ? 'success' : status === 'superseded' ? 'outline' : 'danger';

export function uploadBadge(
  status: UploadStatus,
  t: Translate,
): { tone: BadgeTone; label: string } {
  return { tone: uploadTone(status), label: t(`group.uploadStatus.${status}`) };
}

export interface UploadRowView {
  id: string;
  reference: string;
  entity: string;
  period: string;
  version: string;
  badge: { tone: BadgeTone; label: string };
  rows: string;
  problems: string;
  flags: string;
  by: string;
  href: string;
}

export function uploadRows(
  uploads: readonly Upload[],
  locale: Locale,
  t: Translate,
  formatWhen: (iso: string) => string,
): UploadRowView[] {
  const number = new Intl.NumberFormat(locale);
  return uploads.map((upload) => ({
    id: upload.id,
    reference: upload.reference,
    entity: upload.entity.code,
    period: formatPeriod(upload.period, locale),
    version:
      upload.version === null
        ? '—'
        : t('group.versionNumber', { version: number.format(upload.version) }),
    badge: uploadBadge(upload.status, t),
    rows: number.format(upload.rows),
    problems:
      upload.errors + upload.warnings === 0
        ? '—'
        : t('group.problemCounts', {
            errors: number.format(upload.errors),
            warnings: number.format(upload.warnings),
          }),
    flags: number.format(upload.flags),
    by: t('group.uploadedBy', { name: upload.uploadedByName, date: formatWhen(upload.uploadedAt) }),
    href: uploadHref(upload.id),
  }));
}

/** An upload problem in words: where, and what. */
export function issueRow(
  issue: UploadIssue,
  labels: ReadonlyMap<string, string>,
  locale: Locale,
  t: Translate,
): {
  where: string;
  column: string;
  problem: string;
  severity: { tone: BadgeTone; label: string };
} {
  return {
    where:
      issue.row === null
        ? t('group.wholeFile')
        : issue.row === 1
          ? t('group.headerRow')
          : t('group.rowNumber', { row: new Intl.NumberFormat(locale).format(issue.row) }),
    column: issue.field === null ? '—' : (labels.get(issue.field) ?? issue.field),
    problem: t(`group.issues.${issue.code}`),
    severity:
      issue.severity === 'error'
        ? { tone: 'danger', label: t('group.severity.error') }
        : { tone: 'warning', label: t('group.severity.warning') },
  };
}

/** The comparison with the previous month (R2-09) as labelled figures. */
export function comparisonItems(
  comparison: UploadComparison,
  locale: Locale,
  t: Translate,
): { id: string; label: string; value: string }[] {
  const number = new Intl.NumberFormat(locale);
  const signed = new Intl.NumberFormat(locale, {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
  });
  const previous = comparison.previousHeadcount;
  return [
    {
      id: 'headcount',
      label: t('group.compare.headcount'),
      value:
        previous === null
          ? number.format(comparison.headcount)
          : t('group.compare.fromTo', {
              from: number.format(previous),
              to: number.format(comparison.headcount),
            }),
    },
    {
      id: 'payroll',
      label: t('group.compare.payroll'),
      value:
        comparison.payrollChangePercent === null
          ? '—'
          : `${signed.format(comparison.payrollChangePercent as `${number}`)}%`,
    },
    {
      id: 'new',
      label: t('group.compare.newRecords'),
      value: number.format(comparison.newRecords),
    },
    { id: 'left', label: t('group.compare.left'), value: number.format(comparison.left) },
    { id: 'missing', label: t('group.compare.missing'), value: number.format(comparison.missing) },
    { id: 'changed', label: t('group.compare.changed'), value: number.format(comparison.changed) },
  ];
}

// ---- Employee data ----

export interface EmployeesState {
  period: string;
  entity?: string | undefined;
  department?: string | undefined;
  search?: string | undefined;
  page: number;
}

/** The month defaults to last month: data is uploaded after a month ends. */
export function employeesState(params: SearchParams, now: Date): EmployeesState {
  return {
    period: periodOf(first(params.period)) ?? periodBefore(currentPeriod(now), 1),
    entity: idOf(first(params.entity)),
    department: Department.safeParse(first(params.department)).data,
    search: Search.safeParse(first(params.q)).data,
    page: PageNumber.safeParse(first(params.page)).data ?? 1,
  };
}

export function employeesHref(state: EmployeesState, change: Partial<EmployeesState> = {}): string {
  const next = { ...state, page: 1, ...change };
  return withQuery(GROUP_EMPLOYEES_PATH, {
    period: next.period,
    entity: next.entity,
    department: next.department,
    q: next.search,
    page: pageParam(next.page),
  });
}

/** Field names of a version change, in words where the field is a core one. */
export function fieldName(field: string, labels: ReadonlyMap<string, string>): string {
  return labels.get(field) ?? field;
}

// ---- Data quality ----

export interface FlagsState {
  period?: string | undefined;
  entity?: string | undefined;
  status?: FlagStatus | undefined;
  rule?: string | undefined;
  page: number;
}

export function flagsState(params: SearchParams, now: Date): FlagsState {
  const period = first(params.period);
  return {
    // "all" shows every month; otherwise last month by default.
    period:
      period === 'all' ? undefined : (periodOf(period) ?? periodBefore(currentPeriod(now), 1)),
    entity: idOf(first(params.entity)),
    status: FlagStatusSchema.safeParse(first(params.status)).data,
    rule: RuleCode.safeParse(first(params.rule)).data,
    page: PageNumber.safeParse(first(params.page)).data ?? 1,
  };
}

export function flagsHref(state: FlagsState, change: Partial<FlagsState> = {}): string {
  const next = { ...state, page: 1, ...change };
  return withQuery(GROUP_QUALITY_PATH, {
    period: next.period ?? 'all',
    entity: next.entity,
    status: next.status,
    rule: next.rule,
    page: pageParam(next.page),
  });
}

const flagTone = (status: FlagStatus): BadgeTone =>
  status === 'open' ? 'danger' : status === 'in_progress' ? 'warning' : 'success';

export function flagBadge(status: FlagStatus, t: Translate): { tone: BadgeTone; label: string } {
  return { tone: flagTone(status), label: t(`group.flagStatus.${status}`) };
}

/** A rule's name ("Salary changed by more than the threshold"). */
export function ruleName(kind: RuleKind, t: Translate): string {
  return t(`group.rules.${kind}.name`);
}

/** What a rule checks, with its threshold in words. */
export function ruleDescription(kind: RuleKind, threshold: string | null, t: Translate): string {
  return RULE_THRESHOLD_UNIT.get(kind) === null || threshold === null
    ? t(`group.rules.${kind}.description`)
    : t(`group.rules.${kind}.withThreshold`, { threshold });
}

const DETAIL_ORDER = [
  'previous',
  'current',
  'expected',
  'approvedPercent',
  'change',
  'min',
  'max',
  'grade',
  'months',
  'threshold',
  'previousPeriod',
] as const;
type DetailKey = (typeof DETAIL_ORDER)[number];

/** A flag's values as labelled lines (amounts grouped, percentages with %). */
export function flagDetails(
  flag: Pick<Flag, 'detail'>,
  locale: Locale,
  t: Translate,
): { id: DetailKey; label: string; value: string }[] {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const detail = new Map(Object.entries(flag.detail));
  return DETAIL_ORDER.flatMap((key) => {
    const raw = detail.get(key);
    if (raw === undefined) return [];
    const numeric = DecimalText.safeParse(raw).success;
    const value =
      key === 'previousPeriod'
        ? formatPeriod(raw, locale)
        : key === 'grade' || !numeric
          ? raw
          : ['change', 'threshold', 'approvedPercent'].includes(key)
            ? `${number.format(raw as `${number}`)}%`
            : number.format(raw as `${number}`);
    return [{ id: key, label: t(`group.detail.${key}`), value }];
  });
}

// ---- Raw extract ----

export interface ExtractState {
  period: string;
  entity?: string | undefined;
  allVersions: boolean;
  format: ExtractFormat;
}

export function extractState(params: SearchParams, now: Date): ExtractState {
  return {
    period: periodOf(first(params.period)) ?? periodBefore(currentPeriod(now), 1),
    entity: idOf(first(params.entity)),
    allVersions: first(params.allVersions) === 'true',
    format: ExtractFormatSchema.safeParse(first(params.format)).data ?? 'xlsx',
  };
}

/** Message keys a form may show after a refused call. */
export const GROUP_ERROR_KEYS = [
  'group.errors.invalid',
  'group.errors.mediaType',
  'group.errors.tooLarge',
  'group.errors.infected',
  'group.errors.duplicateFile',
  'group.errors.future',
  'group.errors.forbidden',
  'group.errors.stale',
  'group.errors.superseded',
  'group.errors.noteRequired',
  'group.errors.unavailable',
  'group.errors.generic',
] as const satisfies readonly MessageKey[];
export type GroupErrorKey = (typeof GROUP_ERROR_KEYS)[number];

/** The message for an API refusal, from its status and first detail. */
export function groupErrorFor(
  status: number,
  details: readonly { path: string; code: string }[],
): GroupErrorKey {
  const code = details[0]?.code;
  if (status === 403) return 'group.errors.forbidden';
  if (status === 413 || code === 'too_large') return 'group.errors.tooLarge';
  switch (code) {
    case 'media_type':
      return 'group.errors.mediaType';
    case 'infected':
      return 'group.errors.infected';
    case 'duplicate_file':
      return 'group.errors.duplicateFile';
    case 'future':
      return 'group.errors.future';
    case 'stale':
      return 'group.errors.stale';
    case 'superseded':
      return 'group.errors.superseded';
    case 'note_required':
      return 'group.errors.noteRequired';
    default:
      return status === 400 ? 'group.errors.invalid' : 'group.errors.generic';
  }
}

/** A flag's activity entry in words: raised, updated (to which status), reminded. */
export function activityText(
  entry: { action: string; details: Readonly<Record<string, string | number | boolean | null>> },
  t: Translate,
): string {
  const to = FlagStatusSchema.safeParse(entry.details.to);
  switch (entry.action) {
    case 'anomaly_flag.raised':
      return t('group.activity.raised');
    case 'anomaly_flag.reminded':
      return t('group.activity.reminded', { name: String(entry.details.owner ?? '') });
    case 'anomaly_flag.updated':
      return to.success
        ? t('group.activity.updated', {
            status: t(`group.flagStatus.${to.data}`),
            owner: String(entry.details.owner ?? ''),
          })
        : t('group.activity.other');
    default:
      return t('group.activity.other');
  }
}

/** Employment status in words; unknown values read as active. */
export function employmentStatusKey(
  status: string,
):
  | 'group.employmentStatus.active'
  | 'group.employmentStatus.on_leave'
  | 'group.employmentStatus.left' {
  if (status === 'left') return 'group.employmentStatus.left';
  if (status === 'on_leave') return 'group.employmentStatus.on_leave';
  return 'group.employmentStatus.active';
}

/** Who a flag is about: the employee (name · ID), or the whole subsidiary. */
export function flagSubject(
  flag: Pick<Flag, 'employeeName' | 'employeeNumber'>,
  t: Translate,
): string {
  if (flag.employeeName === null) return t('group.quality.wholeSubsidiary');
  return [flag.employeeName, flag.employeeNumber].filter((part) => part !== null).join(' · ');
}

/** The bar colour of a flag status (paired with the counts written out). */
export function flagFill(status: FlagStatus): string {
  return status === 'open'
    ? 'fill-danger-600'
    : status === 'in_progress'
      ? 'fill-warning-700'
      : 'fill-success-600';
}
