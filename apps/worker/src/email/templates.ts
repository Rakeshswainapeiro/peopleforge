import type { OutboxJob } from '@peopleforge/db';
import { createCatalogues, pluralForm } from '@peopleforge/i18n';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import ar from '../messages/ar.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

const catalogues = createCatalogues({ en, ar });

/** Message-file integrity, checked by the tests. */
export const unknownKeys = (locale: Locale): string[] => catalogues.unknownKeys(locale);

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export type Rendered = { ok: true; email: EmailContent } | { ok: false; reason: string };

// What each notification kind carries (the API writes them, ADR-011). Display values only:
// never salaries, percentages or justifications. Checked again here: the worker trusts no row.
const line = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    // eslint-disable-next-line no-control-regex -- control characters are what is refused
    .regex(/^[^\u0000-\u001f\u007f]+$/u);
const reference = line(40);
const employees = z.number().int().min(0).max(10_000);
const days = z.number().int().min(1).max(30);
const count = z.number().int().min(0).max(100_000);
/** A month of data, "2026-09". */
const period = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/u);
/** Days left before a deadline: 0 is the deadline day itself. */
const dayCount = z.number().int().min(0).max(30);

/** A date as Sirius HR reads it ("30 Nov 2026"), in the reader's language. */
export function formatDay(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
/** A month as people read it ("September 2026"), in the reader's language. */
export function formatMonth(month: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

const PARAMS = {
  request_submitted: z.object({ reference, employees }),
  request_received: z.object({ reference, employees, entity: line(50), actor: line(200) }),
  stage_changed: z.object({
    reference,
    criterion: z.number().int().min(1).max(50),
    of: z.number().int().min(1).max(50),
  }),
  employee_approved: z.object({ reference, employee: line(200) }),
  employee_rejected: z.object({ reference, employee: line(200) }),
  employee_returned: z.object({ reference, employee: line(200) }),
  // "Decide all remaining" (R1-09): one email for everyone, with how many.
  employees_approved: z.object({ reference, employees }),
  employees_rejected: z.object({ reference, employees }),
  employees_returned: z.object({ reference, employees }),
  request_decided: z.object({
    reference,
    status: z.enum(['approved', 'partly_approved', 'rejected']),
  }),
  request_resubmitted: z.object({ reference, employees, entity: line(50), actor: line(200) }),
  // The question itself stays in PeopleForge: emails say that something was asked, not what.
  question_asked: z.object({ reference, employee: line(200), lineId: z.uuid() }),
  question_answered: z.object({
    reference,
    employee: line(200),
    lineId: z.uuid(),
    entity: line(50),
    actor: line(200),
  }),
  // Reminders on configured triggers (R1-13), queued by notify.queue_reminders().
  review_overdue: z.object({ reference, employees, entity: line(50), days }),
  return_overdue: z.object({ reference, employees, days }),
  deadline_approaching: z.object({ reference, employees, deadline: z.iso.date(), days: dayCount }),
  // Group employee data (R2-01, R2-10, R2-11): counts and references only, never values.
  group_upload_accepted: z.object({
    reference,
    entity: line(50),
    period,
    version: z.number().int().min(1),
    flags: count,
    actor: line(200),
    uploadId: z.uuid(),
  }),
  group_flags_raised: z.object({ reference, entity: line(50), period, count, uploadId: z.uuid() }),
  flag_updated: z.object({
    flag: reference,
    flagId: z.uuid(),
    entity: line(50),
    actor: line(200),
    flagStatus: z.enum(['open', 'in_progress', 'resolved']),
  }),
  flag_reminder: z.object({
    flag: reference,
    flagId: z.uuid(),
    entity: line(50),
    actor: line(200),
  }),
  // Reminders queued by notify.queue_group_reminders() (R2-11).
  upload_due: z.object({ entity: line(50), period, days }),
  flag_open: z.object({ flag: reference, flagId: z.uuid(), entity: line(50), days }),
} as const;

type Kind = keyof typeof PARAMS;
const GROUP_KINDS: ReadonlySet<string> = new Set<Kind>([
  'group_upload_accepted',
  'group_flags_raised',
  'flag_updated',
  'flag_reminder',
  'upload_due',
  'flag_open',
]);
const isKind = (kind: string): kind is Kind => Object.hasOwn(PARAMS, kind);

/** Text into HTML: every value is escaped, so a name can't add markup or links. */
export function escapeHtml(value: string): string {
  // `&` first, so the entities added after it aren't escaped again.
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Where the email's button goes: the request's page, or the notifications list. Built with
 * URL from the configured portal address and a UUID, so nothing else can steer it.
 */
export function linkFor(portalUrl: string, requestId: string | null, lineId?: unknown): string {
  const id = z.uuid().safeParse(requestId);
  const line = z.uuid().safeParse(lineId);
  const path = !id.success
    ? '/notifications'
    : line.success
      ? `/requests/${id.data}/employees/${line.data}`
      : `/requests/${id.data}`;
  return new URL(path, portalUrl).toString();
}

/** Where a group data email's button goes: the flag, the upload, or the upload page. */
export function groupLinkFor(
  portalUrl: string,
  params: { flagId?: string; uploadId?: string },
): string {
  const path =
    params.flagId !== undefined
      ? `/group/quality/flags/${params.flagId}`
      : params.uploadId !== undefined
        ? `/group/uploads/${params.uploadId}`
        : '/group/upload';
  return new URL(path, portalUrl).toString();
}

export interface RenderOptions {
  portalUrl: string;
  locale: Locale;
}

/**
 * The email for one notification (R1-07, R1-13), in the recipient's language (English until
 * Arabic content is provided): a subject, a plain-text part and a simple HTML part with one
 * link to PeopleForge. Unknown kinds and malformed values are refused, never guessed.
 */
export function renderEmail(job: OutboxJob, options: RenderOptions): Rendered {
  if (!isKind(job.kind)) return { ok: false, reason: 'unknown_kind' };
  const parsed = PARAMS[job.kind].safeParse(job.params);
  if (!parsed.success) return { ok: false, reason: 'invalid_params' };
  const t = catalogues.translator(options.locale);
  const number = new Intl.NumberFormat(options.locale);
  // Display values only: numbers and dates in the reader's locale, a final status in words.
  const values: Record<string, string> = Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]: [string, string | number]) => [
      key,
      typeof value === 'number'
        ? number.format(value)
        : key === 'deadline'
          ? formatDay(value, options.locale)
          : key === 'period'
            ? formatMonth(value, options.locale)
            : value,
    ]),
  );
  if ('status' in parsed.data) values.status = t(`statuses.${parsed.data.status}`);
  const { flagStatus } = parsed.data as { flagStatus?: 'open' | 'in_progress' | 'resolved' };
  if (flagStatus !== undefined) values.flagStatus = t(`flagStatuses.${flagStatus}`);
  if ('employees' in parsed.data) values.count = number.format(parsed.data.employees);
  const subject = t(`kinds.${job.kind}.subject`, values);
  // Kinds about a number (employees, flags) word it in the singular or plural.
  const counted =
    'employees' in parsed.data
      ? parsed.data.employees
      : 'count' in parsed.data
        ? parsed.data.count
        : 'flags' in parsed.data
          ? parsed.data.flags
          : null;
  const body = t(
    counted === null
      ? `kinds.${job.kind}.body`
      : `kinds.${job.kind}.body.${pluralForm(counted, options.locale)}`,
    values,
  );
  const url = GROUP_KINDS.has(job.kind)
    ? groupLinkFor(options.portalUrl, parsed.data as { flagId?: string; uploadId?: string })
    : linkFor(
        options.portalUrl,
        job.requestId,
        'lineId' in parsed.data ? parsed.data.lineId : undefined,
      );
  const dir = options.locale === 'ar' ? 'rtl' : 'ltr';
  const text = [
    t('email.greeting'),
    '',
    body,
    '',
    t('email.openText', { url }),
    '',
    '--',
    t('email.automated'),
    t('email.footer'),
  ].join('\n');
  const html = `<!doctype html>
<html lang="${options.locale}" dir="${dir}">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<p style="margin:0 0 16px">${escapeHtml(t('email.greeting'))}</p>
<p style="margin:0 0 24px;line-height:1.5">${escapeHtml(body)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold">${escapeHtml(t('email.open'))}</a></p>
<p style="margin:0;font-size:12px;color:#6b7280">${escapeHtml(t('email.automated'))}<br>${escapeHtml(t('email.footer'))}</p>
</div>
</body>
</html>`;
  return { ok: true, email: { subject, text, html } };
}
