import type { AnalyticsQuery, IncrementAnalytics, TatReportQuery } from '@peopleforge/contracts';
import type { AnalyticsRepository } from '@peopleforge/db';
import { displayNameOf, scopeOf, type Principal } from '../../auth/principal.js';
import { ForbiddenError } from '../../errors/domain-errors.js';
import { apiTranslator } from '../../i18n.js';
import type { IncrementRequestService } from '../increment-requests/increment-request.service.js';
import { dateTimeIn } from '../reports/report-labels.js';
import { businessDate, XLSX, type ReportFile } from '../reports/report.service.js';
import { incrementAnalytics } from './measures.js';
import { tatWorkbook } from './tat-workbook.js';

/**
 * TAT and back-and-forth (R1-11, R1-12, DASH-D3/D4) and RP-02 for Sirius HR. The route needs
 * `report:read_operational`; these measures compare subsidiaries, so they are for group scope
 * only (a subsidiary's HR is refused, 403).
 */
export class AnalyticsService {
  constructor(
    private readonly requests: IncrementRequestService,
    private readonly repository: AnalyticsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private groupScope(caller: Principal) {
    const scope = scopeOf(caller);
    if (scope.kind !== 'group') throw new ForbiddenError('Analytics are for Sirius HR');
    return scope;
  }

  async increments(caller: Principal, query: AnalyticsQuery): Promise<IncrementAnalytics> {
    const { criterion, ...filter } = query;
    const facts = await this.repository.facts(this.groupScope(caller), filter);
    return incrementAnalytics(facts, this.now(), criterion);
  }

  /** RP-02 as Excel, in the reader's language; the download is audited. */
  async tatReport(caller: Principal, query: TatReportQuery): Promise<ReportFile> {
    const { format, locale, criterion, ...filter } = query;
    const scope = this.groupScope(caller);
    const t = apiTranslator(locale);
    const [facts, cycles] = await Promise.all([
      this.repository.facts(scope, filter, { report: 'RP-02', format }),
      this.requests.openCycles(caller),
    ]);
    const generatedAt = this.now();
    const analytics = incrementAnalytics(facts, generatedAt, criterion);
    const cycle = cycles.find((candidate) => candidate.id === filter.cycleId);
    const parts = [
      ...(filter.cycleId === undefined
        ? []
        : [t('reports.filterPeriod', { value: cycle?.name.en ?? filter.cycleId })]),
      ...(filter.entityId === undefined
        ? []
        : [
            t('reports.filterEntity', {
              value: facts.requests[0]?.entityCode ?? t('reports.none'),
            }),
          ]),
      ...(criterion === undefined ? [] : [t('analytics.filterCriterion', { value: criterion })]),
    ];
    const body = await tatWorkbook(analytics, t, {
      locale,
      generated: t('reports.generated', {
        date: dateTimeIn(locale, t('reports.none'))(generatedAt),
        name: displayNameOf(caller),
      }),
      filters: t('reports.filters', {
        filters: parts.length === 0 ? t('analytics.filterNone') : parts.join(' · '),
      }),
    });
    return {
      fileName: `PeopleForge-RP-02-${businessDate(generatedAt)}.xlsx`,
      contentType: XLSX,
      body,
    };
  }
}
