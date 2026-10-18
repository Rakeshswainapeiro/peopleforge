import {
  BUSINESS_TIME_ZONE,
  type LineReviewStatus,
  type RequestStatus,
} from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import type { ApiTranslate } from '../../i18n.js';

/** Every word a report file uses, translated once (R1-14; i18n: no strings in layout code). */
export interface ReportLabels {
  locale: Locale;
  title: string;
  code: string;
  generated: string;
  filters: string;
  tatNote: string;
  increaseNote: string;
  truncated: string | null;
  empty: string;
  none: string;
  sheets: { summary: string; requests: string; employees: string };
  countsTitle: string;
  countsTotal: string;
  columns: {
    request: string;
    subsidiary: string;
    status: string;
    employees: string;
    approved: string;
    rejected: string;
    returned: string;
    pending: string;
    submitted: string;
    decided: string;
    tat: string;
    employeeId: string;
    employee: string;
    grade: string;
    currency: string;
    proposed: string;
    approvedPercent: string;
    increase: string;
    employeeStatus: string;
  };
  status: (status: RequestStatus) => string;
  lineStatus: (status: LineReviewStatus) => string;
  page: (page: number, pages: number) => string;
  /** A date and time in Asia/Dubai, in the reader's locale; "—" for none. */
  dateTime: (value: Date | null) => string;
}

export function reportLabels(
  t: ApiTranslate,
  locale: Locale,
  meta: { generatedAt: Date; by: string; filters: string; truncatedAt: number | null },
): ReportLabels {
  // As the portal shows dates: "17 Oct 2026, 12:00", Asia/Dubai.
  const format = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: BUSINESS_TIME_ZONE,
  });
  const none = t('reports.none');
  const dateTime = (value: Date | null) => (value === null ? none : format.format(value));
  return {
    locale,
    title: t('reports.title'),
    code: t('reports.code'),
    generated: t('reports.generated', { date: dateTime(meta.generatedAt), name: meta.by }),
    filters: t('reports.filters', { filters: meta.filters }),
    tatNote: t('reports.tatNote'),
    increaseNote: t('reports.increaseNote'),
    truncated:
      meta.truncatedAt === null
        ? null
        : t('reports.truncated', { count: new Intl.NumberFormat(locale).format(meta.truncatedAt) }),
    empty: t('reports.empty'),
    none,
    sheets: {
      summary: t('reports.sheetSummary'),
      requests: t('reports.sheetRequests'),
      employees: t('reports.sheetEmployees'),
    },
    countsTitle: t('reports.countsTitle'),
    countsTotal: t('reports.countsTotal'),
    columns: {
      request: t('reports.colRequest'),
      subsidiary: t('reports.colSubsidiary'),
      status: t('reports.colStatus'),
      employees: t('reports.colEmployees'),
      approved: t('reports.colApproved'),
      rejected: t('reports.colRejected'),
      returned: t('reports.colReturned'),
      pending: t('reports.colPending'),
      submitted: t('reports.colSubmitted'),
      decided: t('reports.colDecided'),
      tat: t('reports.colTat'),
      employeeId: t('reports.colEmployeeId'),
      employee: t('reports.colEmployee'),
      grade: t('reports.colGrade'),
      currency: t('reports.colCurrency'),
      proposed: t('reports.colProposed'),
      approvedPercent: t('reports.colApprovedPercent'),
      increase: t('reports.colIncrease'),
      employeeStatus: t('reports.colEmployeeStatus'),
    },
    status: (status) => t(`statuses.${status}`),
    lineStatus: (status) => t(`lineStatuses.${status}`),
    page: (page, pages) => t('reports.page', { page: String(page), pages: String(pages) }),
    dateTime,
  };
}
