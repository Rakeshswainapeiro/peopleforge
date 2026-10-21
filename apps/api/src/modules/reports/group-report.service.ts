import {
  groupReportSpec,
  monthsOfPeriod,
  periodBounds,
  reportPeriodSchema,
  type GroupReportCode,
  type GroupReportQuery,
} from '@peopleforge/contracts';
import type { EntityDirectory, ReportRepository } from '@peopleforge/db';
import { displayNameOf, scopeOf, type Principal } from '../../auth/principal.js';
import { ValidationError } from '../../errors/domain-errors.js';
import { apiTranslator } from '../../i18n.js';
import type { AnalyticsService } from '../analytics/analytics.service.js';
import { monthsBefore } from '../group-data/compare.js';
import type { DataQualityService } from '../group-data/data-quality.service.js';
import type { GroupDashboardService } from '../group-data/dashboard.service.js';
import {
  rp03,
  rp04,
  rp05,
  rp06,
  rp07,
  type MonthTat,
  type ReportContext,
} from './group-reports.js';
import { documentPdf, documentWorkbook, type ReportDocument } from './report-document.js';
import { dateTimeIn } from './report-labels.js';
import { businessDate, XLSX, type ReportFile } from './report.service.js';

/** Most flags RP-05 lists; the rest are on the Data quality page (the report says so). */
export const RP05_FLAG_LIMIT = 2_000;

export interface GroupReportDependencies {
  dashboards: Pick<GroupDashboardService, 'overview' | 'compensation' | 'executive'>;
  quality: Pick<DataQualityService, 'flags'>;
  analytics: Pick<AnalyticsService, 'increments'>;
  reports: Pick<ReportRepository, 'recordDownload'>;
  directory: Pick<EntityDirectory, 'entities'>;
  now?: () => Date;
}

/**
 * The group HR reports (R2-06, R2-07) as Excel or PDF, from the dashboards' figures and in the
 * caller's scope (Row-Level Security: a subsidiary's HR get their own subsidiary). The route
 * checks the permission; RP-06 and RP-07 are for Sirius only (the executive figures refuse
 * anyone else). Every download is audited (R2-13).
 */
export class GroupReportService {
  private readonly now: () => Date;

  constructor(private readonly deps: GroupReportDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  async report(
    caller: Principal,
    code: GroupReportCode,
    query: GroupReportQuery,
  ): Promise<ReportFile> {
    const spec = groupReportSpec(code);
    const problems = [
      ...(reportPeriodSchema(spec.cadence).safeParse(query.period).success
        ? []
        : [{ path: 'period', code: 'invalid' }]),
      ...(spec.formats.includes(query.format) ? [] : [{ path: 'format', code: 'invalid' }]),
      // The quarterly and annual reviews are group-wide.
      ...(spec.cadence !== 'month' && query.entityId !== undefined
        ? [{ path: 'entityId', code: 'invalid' }]
        : []),
    ];
    if (problems.length > 0) throw new ValidationError('Invalid report query', problems);

    const t = apiTranslator(query.locale);
    const generatedAt = this.now();
    const entities = await this.deps.directory.entities(scopeOf(caller));
    const entity = entities.find((candidate) => candidate.id === query.entityId);
    const context: ReportContext = {
      t,
      locale: query.locale,
      meta: [
        t('reports.generated', {
          date: dateTimeIn(query.locale, t('reports.none'))(generatedAt),
          name: displayNameOf(caller),
        }),
        t('reports.filters', {
          filters:
            query.entityId === undefined
              ? t('groupReports.filterNone')
              : t('reports.filterEntity', { value: entity?.code ?? t('reports.none') }),
        }),
      ],
    };
    const document = await this.build(caller, code, query, context);
    const body =
      query.format === 'xlsx' ? await documentWorkbook(document) : await documentPdf(document);
    await this.deps.reports.recordDownload(scopeOf(caller), {
      report: document.code,
      format: query.format,
      period: query.period,
      entityId: query.entityId,
    });
    return {
      fileName: `PeopleForge-${document.code}-${query.period}-${businessDate(generatedAt)}.${query.format}`,
      contentType: query.format === 'xlsx' ? XLSX : 'application/pdf',
      body,
    };
  }

  private async build(
    caller: Principal,
    code: GroupReportCode,
    query: GroupReportQuery,
    context: ReportContext,
  ): Promise<ReportDocument> {
    const filter = { period: query.period, entityId: query.entityId };
    switch (code) {
      case 'rp-03':
        return rp03(await this.deps.dashboards.overview(caller, filter), context);
      case 'rp-04':
        return rp04(
          await this.deps.dashboards.compensation(caller, filter),
          await this.monthTat(caller, query.period),
          context,
        );
      case 'rp-05':
        return rp05(
          await this.deps.quality.flags(caller, {
            ...filter,
            page: 1,
            pageSize: RP05_FLAG_LIMIT,
          }),
          query.period,
          context,
        );
      case 'rp-06':
      case 'rp-07': {
        const cadence = code === 'rp-06' ? 'quarter' : 'year';
        const bounds = periodBounds(query.period, cadence);
        // The executive view refuses a subsidiary (403) before anything else is read.
        const end = await this.deps.dashboards.executive(caller, { period: bounds.last });
        const previousEnd = await this.deps.dashboards.executive(caller, {
          period: monthsBefore(bounds.first, 1),
        });
        const overviews = [];
        for (const month of monthsOfPeriod(query.period, cadence)) {
          overviews.push(await this.deps.dashboards.overview(caller, { period: month }));
        }
        const span = { months: overviews, end, previousEnd };
        if (code === 'rp-06') return rp06(query.period, span, context);
        const december = await this.deps.dashboards.compensation(caller, {
          period: `${query.period}-12`,
        });
        return rp07(query.period, span, december.increments, context);
      }
    }
  }

  /** TAT of the increment requests decided in the month (Sirius HR only; R1-11). */
  private async monthTat(caller: Principal, period: string): Promise<MonthTat | null> {
    if (caller.scope !== 'group') return null;
    const analytics = await this.deps.analytics.increments(caller, {});
    const month = analytics.tat.trend.find((row) => row.month === period);
    return month === undefined
      ? null
      : { decided: month.count, averageDays: month.averageDays, medianDays: month.medianDays };
  }
}
