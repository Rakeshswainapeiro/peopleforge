import ExcelJS from 'exceljs';
import { IncrementAnalyticsSchema } from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../auth/principal.js';
import { ForbiddenError } from '../../errors/domain-errors.js';
import { anonymous, buildApp, errorOf, resolveAs, SUB_A } from '../../test-support/factory.js';
import { workingDataQuality, workingGroupData } from '../../test-support/group-data.js';
import {
  compensationFixture,
  executiveFixture,
  flagPageFixture,
  overviewFixture,
} from '../../test-support/group-reports.js';
import { alphaHr, executive, reviewer } from '../../test-support/increment-requests.js';
import {
  GroupReportService,
  RP05_FLAG_LIMIT,
  type GroupReportDependencies,
} from './group-report.service.js';

// The group reports (R2-06, R2-07): validation, scope, each report's data, files and audit.

const NOW = new Date('2026-10-21T08:00:00Z');
const ENTITIES = [{ id: SUB_A, code: 'SUB-A', name: { en: 'Subsidiary A' } }];

function trendAnalytics(month = '2026-09') {
  return IncrementAnalyticsSchema.parse({
    generatedAt: NOW.toISOString(),
    tat: {
      requests: 0,
      decided: 0,
      averageDays: null,
      medianDays: null,
      open: 0,
      openAverageDays: null,
      longestOpen: null,
      byCriterion: [],
      trend: [{ month, count: 2, averageDays: '3.5', medianDays: '3.0' }],
      criteria: [],
      byEntity: [],
      byRequest: [],
    },
    backAndForth: {
      returns: 0,
      openReturns: 0,
      averageReturnDays: null,
      questions: 0,
      averageAnswerDays: null,
      byEntity: [],
      byRequest: [],
    },
  });
}

function fakes() {
  return {
    dashboards: {
      overview: vi.fn<GroupReportDependencies['dashboards']['overview']>((_caller, query) =>
        Promise.resolve(overviewFixture({ period: query.period })),
      ),
      compensation: vi.fn<GroupReportDependencies['dashboards']['compensation']>(() =>
        Promise.resolve(compensationFixture()),
      ),
      executive: vi.fn<GroupReportDependencies['dashboards']['executive']>((_caller, query) =>
        Promise.resolve(executiveFixture({ period: query.period })),
      ),
    },
    quality: {
      flags: vi.fn<GroupReportDependencies['quality']['flags']>(() =>
        Promise.resolve(flagPageFixture()),
      ),
    },
    analytics: {
      increments: vi.fn<GroupReportDependencies['analytics']['increments']>(() =>
        Promise.resolve(trendAnalytics()),
      ),
    },
    reports: {
      recordDownload: vi.fn<GroupReportDependencies['reports']['recordDownload']>(() =>
        Promise.resolve(),
      ),
    },
    directory: {
      entities: vi.fn<GroupReportDependencies['directory']['entities']>(() =>
        Promise.resolve(ENTITIES),
      ),
    },
  };
}

function service(deps = fakes()) {
  return { deps, service: new GroupReportService({ ...deps, now: () => NOW }) };
}

async function summaryOf(body: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body as unknown as ArrayBuffer);
  return (workbook.getWorksheet('Summary')?.getColumn(1).values ?? []).map(String);
}

describe('GroupReportService [R2-06, R2-07]', () => {
  it('refuses a period, format or subsidiary the report does not take, reading nothing', async () => {
    const { deps, service: reports } = service();
    await expect(
      reports.report(reviewer, 'rp-03', { period: '2026-Q3', format: 'xlsx', locale: 'en' }),
    ).rejects.toMatchObject({ details: [{ path: 'period', code: 'invalid' }] });
    await expect(
      reports.report(reviewer, 'rp-06', {
        period: '2026-Q3',
        format: 'xlsx',
        locale: 'en',
        entityId: SUB_A,
      }),
    ).rejects.toMatchObject({
      details: [
        { path: 'format', code: 'invalid' },
        { path: 'entityId', code: 'invalid' },
      ],
    });
    expect(deps.directory.entities).not.toHaveBeenCalled();
    expect(deps.reports.recordDownload).not.toHaveBeenCalled();
  });

  it('builds RP-03 for a subsidiary filter, names it, and audits the download', async () => {
    const { deps, service: reports } = service();
    const file = await reports.report(reviewer, 'rp-03', {
      period: '2026-09',
      format: 'xlsx',
      locale: 'en',
      entityId: SUB_A,
    });
    expect(file).toMatchObject({
      fileName: 'PeopleForge-RP-03-2026-09-2026-10-21.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(deps.dashboards.overview).toHaveBeenCalledWith(reviewer, {
      period: '2026-09',
      entityId: SUB_A,
    });
    const summary = await summaryOf(file.body);
    expect(summary).toContain('RP-03 · Headcount & demographics');
    expect(summary).toContain('Filters: Subsidiary: SUB-A');
    expect(summary.some((line) => line.startsWith('Generated 21 Oct 2026, 12:00 by'))).toBe(true);
    expect(deps.reports.recordDownload).toHaveBeenCalledWith(
      { userId: 'reviewer', userName: 'Reviewer', kind: 'group' },
      { report: 'RP-03', format: 'xlsx', period: '2026-09', entityId: SUB_A },
    );
  });

  it('words an unknown subsidiary plainly, and no filter as everything visible', async () => {
    const { service: reports } = service();
    const unknown = await reports.report(reviewer, 'rp-03', {
      period: '2026-09',
      format: 'xlsx',
      locale: 'en',
      entityId: '00000000-0000-4000-8000-0000000e0999',
    });
    expect(await summaryOf(unknown.body)).toContain('Filters: Subsidiary: —');
    const all = await reports.report(reviewer, 'rp-03', {
      period: '2026-09',
      format: 'pdf',
      locale: 'ar',
    });
    expect(all.contentType).toBe('application/pdf');
    expect(all.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('adds the month’s TAT to RP-04 for Sirius HR only', async () => {
    const group = service();
    await group.service.report(reviewer, 'rp-04', {
      period: '2026-09',
      format: 'xlsx',
      locale: 'en',
    });
    expect(group.deps.analytics.increments).toHaveBeenCalledWith(reviewer, {});
    // A month outside the trend has no TAT section.
    const old = service();
    await old.service.report(reviewer, 'rp-04', { period: '2024-01', format: 'pdf', locale: 'en' });
    const subsidiary = service();
    await subsidiary.service.report(alphaHr, 'rp-04', {
      period: '2026-09',
      format: 'pdf',
      locale: 'en',
    });
    expect(subsidiary.deps.analytics.increments).not.toHaveBeenCalled();
  });

  it('lists RP-05’s flags for the month, up to the limit', async () => {
    const { deps, service: reports } = service();
    await reports.report(alphaHr, 'rp-05', { period: '2026-09', format: 'pdf', locale: 'en' });
    expect(deps.quality.flags).toHaveBeenCalledWith(alphaHr, {
      period: '2026-09',
      entityId: undefined,
      page: 1,
      pageSize: RP05_FLAG_LIMIT,
    });
  });

  it('reads RP-06 from the quarter’s months and both quarter ends', async () => {
    const { deps, service: reports } = service();
    const file = await reports.report(reviewer, 'rp-06', {
      period: '2026-Q3',
      format: 'pdf',
      locale: 'en',
    });
    expect(file.fileName).toBe('PeopleForge-RP-06-2026-Q3-2026-10-21.pdf');
    expect(deps.dashboards.executive.mock.calls.map((call) => call[1].period)).toEqual([
      '2026-09',
      '2026-06',
    ]);
    expect(deps.dashboards.overview.mock.calls.map((call) => call[1].period)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(deps.dashboards.compensation).not.toHaveBeenCalled();
  });

  it('reads RP-07 from twelve months, both year ends and December’s increments', async () => {
    const { deps, service: reports } = service();
    await reports.report(executive, 'rp-07', { period: '2026', format: 'pdf', locale: 'en' });
    expect(deps.dashboards.executive.mock.calls.map((call) => call[1].period)).toEqual([
      '2026-12',
      '2025-12',
    ]);
    expect(deps.dashboards.overview).toHaveBeenCalledTimes(12);
    expect(deps.dashboards.compensation).toHaveBeenCalledWith(executive, { period: '2026-12' });
  });

  it('lets the executive view refuse a subsidiary before anything else is read', async () => {
    const deps = fakes();
    deps.dashboards.executive.mockRejectedValue(new ForbiddenError('Group view for Sirius only'));
    await expect(
      service(deps).service.report(alphaHr, 'rp-06', {
        period: '2026-Q3',
        format: 'pdf',
        locale: 'en',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.dashboards.overview).not.toHaveBeenCalled();
    expect(deps.reports.recordDownload).not.toHaveBeenCalled();
  });

  it('takes the current time by default', () => {
    const deps = fakes();
    expect(new GroupReportService(deps)).toBeInstanceOf(GroupReportService);
  });
});

describe('group report routes [R2-06, R2-07, NFR-SEC-01]', () => {
  async function http(caller: Principal | null) {
    const app = await buildApp({
      resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
      groupData: workingGroupData(),
      dataQuality: workingDataQuality(),
      analytics: {
        facts: () =>
          Promise.resolve({ requests: [], verifications: [], returns: [], messages: [] }),
      },
      reports: {
        incrementLines: () => Promise.reject(new Error('unexpected')),
        recordDownload: () => Promise.resolve(),
      },
    });
    return app.getHttpServer();
  }

  it.each(['rp-03', 'rp-04', 'rp-05', 'rp-06', 'rp-07'])(
    'refuses /reports/%s without a session (401)',
    async (code) => {
      const res = await request(await http(null))
        .get(`/api/v1/reports/${code}?period=2026-09&format=pdf`)
        .expect(401);
      expect(errorOf(res).code).toBe('UNAUTHENTICATED');
    },
  );

  // Executives have no employee data; subsidiary HR have no executive reporting.
  it.each([
    [executive, 'rp-03'],
    [executive, 'rp-04'],
    [executive, 'rp-05'],
    [alphaHr, 'rp-06'],
    [alphaHr, 'rp-07'],
  ] as const)('refuses %#: %s without the permission (403)', async (caller, code) => {
    const res = await request(await http(caller))
      .get(`/api/v1/reports/${code}?period=2026-09&format=pdf`)
      .expect(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('serves each report as an uncached attachment, and validates the query', async () => {
    const server = await http(reviewer);
    for (const [code, period, format] of [
      ['rp-03', '2026-09', 'xlsx'],
      ['rp-04', '2026-09', 'pdf'],
      ['rp-05', '2026-09', 'xlsx'],
      ['rp-06', '2026-Q3', 'pdf'],
      ['rp-07', '2026', 'pdf'],
    ] as const) {
      const res = await request(server)
        .get(`/api/v1/reports/${code}?period=${period}&format=${format}`)
        .buffer(true)
        .expect(200);
      expect(res.headers['content-disposition']).toContain(
        `PeopleForge-${code.toUpperCase()}-${period}-`,
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
    await request(server).get('/api/v1/reports/rp-03?period=2026-09&format=csv').expect(400);
    await request(server).get('/api/v1/reports/rp-06?period=2026-09&format=pdf').expect(400);
    await request(server)
      .get('/api/v1/reports/rp-03?period=2026-09&format=pdf&sort=pay')
      .expect(400);
  });
});
