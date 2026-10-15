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
const PARAMS = {
  request_submitted: z.object({
    reference: line(40),
    employees: z.number().int().min(0).max(10_000),
  }),
  request_received: z.object({
    reference: line(40),
    employees: z.number().int().min(0).max(10_000),
    entity: line(50),
    actor: line(200),
  }),
} as const;

type Kind = keyof typeof PARAMS;
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
export function linkFor(portalUrl: string, requestId: string | null): string {
  const id = z.uuid().safeParse(requestId);
  return new URL(id.success ? `/requests/${id.data}` : '/notifications', portalUrl).toString();
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
  const values = {
    ...parsed.data,
    count: new Intl.NumberFormat(options.locale).format(parsed.data.employees),
  };
  const subject = t(`kinds.${job.kind}.subject`, values);
  const body = t(
    `kinds.${job.kind}.body.${pluralForm(parsed.data.employees, options.locale)}`,
    values,
  );
  const url = linkFor(options.portalUrl, job.requestId);
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
