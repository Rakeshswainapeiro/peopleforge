import { BUSINESS_TIME_ZONE, type IncrementReportQuery } from '@peopleforge/contracts';
import type { ReportRepository } from '@peopleforge/db';
import {
  displayNameOf,
  permissionsOfPrincipal,
  scopeOf,
  type Principal,
} from '../../auth/principal.js';
import { ForbiddenError } from '../../errors/domain-errors.js';
import { apiTranslator } from '../../i18n.js';
import {
  seesDrafts,
  type IncrementRequestService,
} from '../increment-requests/increment-request.service.js';
import { incrementPdf } from './pdf.js';
import { reportContent } from './report-content.js';
import { reportLabels } from './report-labels.js';
import { incrementWorkbook } from './xlsx.js';

export interface ReportFile {
  fileName: string;
  contentType: string;
  body: Buffer;
}

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** "2026-10-17" in Asia/Dubai, for file names. */
export function businessDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(at);
}

/**
 * The increment status report (RP-01, R1-14) as Excel or PDF, for the caller's own requests
 * (Row-Level Security; drafts only for those who prepare them) with the dashboard's filters.
 * The repository records the download in the audit trail (R1-15).
 */
export class ReportService {
  constructor(
    private readonly requests: IncrementRequestService,
    private readonly repository: ReportRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async incrementReport(caller: Principal, query: IncrementReportQuery): Promise<ReportFile> {
    // RP-01 lists people and their increments: the report permission alone (admins) isn't enough.
    const permissions = permissionsOfPrincipal(caller);
    if (
      !permissions.has('increment_request:read') ||
      !permissions.has('employee_data:read_compensation')
    ) {
      throw new ForbiddenError('RP-01 needs increment requests and compensation access');
    }
    const { format, locale, ...filter } = query;
    const t = apiTranslator(locale);
    const [data, cycles] = await Promise.all([
      this.repository.incrementLines(
        scopeOf(caller),
        { ...filter, includeDrafts: seesDrafts(caller) },
        { report: 'RP-01', format },
      ),
      this.requests.openCycles(caller),
    ]);
    const generatedAt = this.now();
    const content = reportContent(data.lines, data.truncated, generatedAt);
    const cycle = cycles.find((candidate) => candidate.id === filter.cycleId);
    const parts = [
      ...(filter.cycleId === undefined
        ? []
        : [t('reports.filterPeriod', { value: cycle?.name.en ?? filter.cycleId })]),
      ...(filter.entityId === undefined
        ? []
        : [
            t('reports.filterEntity', {
              value: content.requests[0]?.entityCode ?? t('reports.none'),
            }),
          ]),
      ...(filter.status === undefined
        ? []
        : [t('reports.filterStatus', { value: t(`statuses.${filter.status}`) })]),
      ...(filter.search === undefined ? [] : [t('reports.filterSearch', { value: filter.search })]),
    ];
    const labels = reportLabels(t, locale, {
      generatedAt,
      by: displayNameOf(caller),
      filters: parts.length === 0 ? t('reports.filterNone') : parts.join(' · '),
      truncatedAt: data.truncated ? data.lines.length : null,
    });
    const body =
      format === 'xlsx'
        ? await incrementWorkbook(content, labels)
        : await incrementPdf(content, labels);
    return {
      fileName: `PeopleForge-RP-01-${businessDate(generatedAt)}.${format}`,
      contentType: format === 'xlsx' ? XLSX : 'application/pdf',
      body,
    };
  }
}
