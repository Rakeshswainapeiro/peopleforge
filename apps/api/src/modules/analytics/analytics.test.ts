import ExcelJS from 'exceljs';
import { IncrementAnalyticsSchema } from '@peopleforge/contracts';
import type { AnalyticsFacts, AnalyticsRepository } from '@peopleforge/db';
import request from 'supertest';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  anonymous,
  buildApp,
  errorOf,
  resolveAs,
  SUB_A,
  unusedAnalytics,
} from '../../test-support/factory.js';
import {
  alphaHr,
  CYCLE_ID,
  executive,
  reviewer,
  workingRepository,
} from '../../test-support/increment-requests.js';
import { IncrementRequestService } from '../increment-requests/increment-request.service.js';
import { AnalyticsService } from './analytics.service.js';
import {
  averageDays,
  businessMonth,
  days,
  elapsedDays,
  incrementAnalytics,
  lastTwelveMonths,
  medianDays,
} from './measures.js';

// TAT and back-and-forth (R1-11, R1-12, ADR-006) with worked examples, and RP-02 (R1-14).
const NOW = new Date('2026-10-18T08:00:00Z');
const at = (iso: string) => new Date(iso);
const R1 = '11111111-1111-4111-8111-000000000001';
const R2 = '11111111-1111-4111-8111-000000000002';
const R3 = '11111111-1111-4111-8111-000000000003';
const L1 = '22222222-2222-4222-8222-000000000001';
const L2 = '22222222-2222-4222-8222-000000000002';
const L3 = '22222222-2222-4222-8222-000000000003';

/**
 * R1 (SUB-A): submitted 10 Oct 08:00, decided 14 Oct 20:00 → 4.5 days. Aisha's C1 verified a
 * day after submission; Yusuf returned 11 Oct 08:00, resubmitted 13 Oct 08:00 (2 days), his C1
 * verified 13 Oct 20:00 (0.5 days after resubmission). Two questions on 11 Oct 08:00 and 12:00,
 * answered together 12 Oct 08:00 (1 day from the first); a third unanswered.
 * R2 (SUB-B): submitted 16 Oct 08:00, open → 2 days at NOW; a return still open since 17 Oct.
 * R3 (SUB-A): submitted 12 Oct 08:00, decided 13 Oct 08:00 → 1 day; nothing went back.
 */
function facts(): AnalyticsFacts {
  return {
    requests: [
      {
        id: R1,
        reference: 'INC-2026-0001',
        entityId: SUB_A,
        entityCode: 'SUB-A',
        status: 'partly_approved',
        employees: 2,
        submittedAt: at('2026-10-10T08:00:00Z'),
        decidedAt: at('2026-10-14T20:00:00Z'),
      },
      {
        id: R2,
        reference: 'INC-2026-0002',
        entityId: SUB_A,
        entityCode: 'SUB-B',
        status: 'returned',
        employees: 1,
        submittedAt: at('2026-10-16T08:00:00Z'),
        decidedAt: null,
      },
      {
        id: R3,
        reference: 'INC-2026-0003',
        entityId: SUB_A,
        entityCode: 'SUB-A',
        status: 'approved',
        employees: 1,
        submittedAt: at('2026-10-12T08:00:00Z'),
        decidedAt: at('2026-10-13T08:00:00Z'),
      },
    ],
    verifications: [
      {
        requestId: R1,
        lineId: L2,
        code: 'C2',
        position: 2,
        waitingSince: at('2026-10-10T08:00:00Z'),
        verifiedAt: at('2026-10-12T08:00:00Z'),
      },
      {
        requestId: R1,
        lineId: L1,
        code: 'C1',
        position: 1,
        waitingSince: at('2026-10-10T08:00:00Z'),
        verifiedAt: at('2026-10-11T08:00:00Z'),
      },
      {
        requestId: R1,
        lineId: L2,
        code: 'C1',
        position: 1,
        waitingSince: at('2026-10-13T08:00:00Z'),
        verifiedAt: at('2026-10-13T20:00:00Z'),
      },
    ],
    returns: [
      {
        requestId: R1,
        lineId: L2,
        returnedAt: at('2026-10-11T08:00:00Z'),
        resubmittedAt: at('2026-10-13T08:00:00Z'),
      },
      { requestId: R2, lineId: L3, returnedAt: at('2026-10-17T08:00:00Z'), resubmittedAt: null },
    ],
    messages: [
      { requestId: R1, lineId: L2, side: 'subsidiary', at: at('2026-10-11T07:00:00Z') },
      { requestId: R1, lineId: L2, side: 'sirius', at: at('2026-10-11T08:00:00Z') },
      { requestId: R1, lineId: L2, side: 'sirius', at: at('2026-10-11T12:00:00Z') },
      { requestId: R1, lineId: L2, side: 'subsidiary', at: at('2026-10-12T08:00:00Z') },
      { requestId: R1, lineId: L1, side: 'sirius', at: at('2026-10-12T09:00:00Z') },
    ],
  };
}

describe('measures [R1-11, R1-12, ADR-006]', () => {
  it('counts elapsed days, never negative, shown with one decimal', () => {
    expect(elapsedDays(at('2026-10-10T08:00:00Z'), at('2026-10-11T20:00:00Z'))).toBe(1.5);
    expect(elapsedDays(at('2026-10-11T00:00:00Z'), at('2026-10-10T00:00:00Z'))).toBe(0);
    expect(days(1.25)).toBe('1.3');
    expect(days(0)).toBe('0.0');
    expect(averageDays([])).toBeNull();
    expect(averageDays([1, 2])).toBe('1.5');
  });

  it('measures request and criterion TAT, by subsidiary, longest first', () => {
    const { tat } = incrementAnalytics(facts(), NOW);
    expect(tat).toMatchObject({
      requests: 3,
      decided: 2,
      // (4.5 + 1) / 2
      averageDays: '2.8',
      open: 1,
      openAverageDays: '2.0',
      longestOpen: { reference: 'INC-2026-0002', days: '2.0', open: true },
    });
    expect(tat.byRequest.map((row) => [row.reference, row.days, row.open])).toEqual([
      ['INC-2026-0001', '4.5', false],
      ['INC-2026-0002', '2.0', true],
      ['INC-2026-0003', '1.0', false],
    ]);
    // C1: 1 day (Aisha) and 0.5 day after Yusuf's resubmission; C2: 2 days.
    expect(tat.byCriterion).toEqual([
      { code: 'C1', verified: 2, averageDays: '0.8', medianDays: '0.8', maxDays: '1.0' },
      { code: 'C2', verified: 1, averageDays: '2.0', medianDays: '2.0', maxDays: '2.0' },
    ]);
    expect(tat.medianDays).toBe('2.8');
    expect(tat.criteria).toEqual(['C1', 'C2']);
    expect(tat.byEntity).toEqual([
      { entityCode: 'SUB-A', requests: 2, decided: 2, averageDays: '2.8', openAverageDays: null },
      { entityCode: 'SUB-B', requests: 1, decided: 0, averageDays: null, openAverageDays: '2.0' },
    ]);
  });

  it('takes the median of an odd and an even count [DASH-D3]', () => {
    expect(medianDays([])).toBeNull();
    expect(medianDays([5, 1, 3])).toBe('3.0');
    expect(medianDays([4, 1, 10, 2])).toBe('3.0');
    expect(medianDays([0.5])).toBe('0.5');
  });

  it('trends decided TAT over the last 12 months in Dubai time [DASH-D3]', () => {
    expect(lastTwelveMonths(NOW)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    // 31 Oct 21:00 UTC is already 1 November in Dubai (UTC+4).
    expect(businessMonth(at('2026-10-31T19:59:59Z'))).toBe('2026-10');
    expect(businessMonth(at('2026-10-31T20:00:00Z'))).toBe('2026-11');
    const { tat } = incrementAnalytics(facts(), NOW);
    expect(tat.trend).toHaveLength(12);
    expect(tat.trend.at(-1)).toEqual({
      month: '2026-10',
      count: 2,
      averageDays: '2.8',
      medianDays: '2.8',
    });
    expect(tat.trend.at(0)).toEqual({
      month: '2025-11',
      count: 0,
      averageDays: null,
      medianDays: null,
    });
  });

  it('narrows criterion TAT and the trend to one criterion, keeping the choices [DASH-D3]', () => {
    const { tat } = incrementAnalytics(facts(), NOW, 'C1');
    expect(tat.byCriterion.map((row) => row.code)).toEqual(['C1']);
    expect(tat.criteria).toEqual(['C1', 'C2']);
    // C1 verified twice in October: 1 day and 0.5 day.
    expect(tat.trend.at(-1)).toEqual({
      month: '2026-10',
      count: 2,
      averageDays: '0.8',
      medianDays: '0.8',
    });
    // Requests and back-and-forth are not narrowed by a criterion.
    expect(tat.requests).toBe(3);
    expect(incrementAnalytics(facts(), NOW, 'C9').tat.byCriterion).toEqual([]);
  });

  it('measures time with the subsidiary and answers to questions', () => {
    const { backAndForth } = incrementAnalytics(facts(), NOW);
    expect(backAndForth).toMatchObject({
      returns: 2,
      openReturns: 1,
      // 2 days, and 1 day so far.
      averageReturnDays: '1.5',
      questions: 3,
      averageAnswerDays: '1.0',
    });
    expect(backAndForth.byRequest).toEqual([
      {
        id: R1,
        reference: 'INC-2026-0001',
        entityCode: 'SUB-A',
        status: 'partly_approved',
        returns: 1,
        openReturns: 0,
        daysWithSubsidiary: '2.0',
        questions: 3,
        answers: 1,
        averageAnswerDays: '1.0',
      },
      {
        id: R2,
        reference: 'INC-2026-0002',
        entityCode: 'SUB-B',
        status: 'returned',
        returns: 1,
        openReturns: 1,
        daysWithSubsidiary: '1.0',
        questions: 0,
        answers: 0,
        averageAnswerDays: null,
      },
    ]);
    expect(backAndForth.byEntity).toEqual([
      {
        entityCode: 'SUB-A',
        requests: 2,
        returns: 1,
        averageReturnDays: '2.0',
        questions: 3,
        averageAnswerDays: '1.0',
      },
      {
        entityCode: 'SUB-B',
        requests: 1,
        returns: 1,
        averageReturnDays: '1.0',
        questions: 0,
        averageAnswerDays: null,
      },
    ]);
  });

  it('orders equal measures by reference, and has nothing to say about nothing', () => {
    const twins = facts();
    const [first] = twins.requests;
    if (first === undefined) throw new Error('fixture');
    twins.requests = [
      { ...first, id: R2, reference: 'INC-2026-0009' },
      { ...first, id: R3, reference: 'INC-2026-0008' },
    ];
    twins.returns = [
      {
        requestId: R2,
        lineId: L1,
        returnedAt: at('2026-10-11T08:00:00Z'),
        resubmittedAt: at('2026-10-12T08:00:00Z'),
      },
      {
        requestId: R3,
        lineId: L2,
        returnedAt: at('2026-10-11T08:00:00Z'),
        resubmittedAt: at('2026-10-12T08:00:00Z'),
      },
    ];
    const result = incrementAnalytics(twins, NOW);
    expect(result.tat.byRequest.map((row) => row.reference)).toEqual([
      'INC-2026-0008',
      'INC-2026-0009',
    ]);
    expect(result.backAndForth.byRequest.map((row) => row.reference)).toEqual([
      'INC-2026-0008',
      'INC-2026-0009',
    ]);
    const empty = incrementAnalytics(
      { requests: [], verifications: [], returns: [], messages: [] },
      NOW,
    );
    expect(IncrementAnalyticsSchema.parse(empty)).toMatchObject({
      tat: { requests: 0, averageDays: null, longestOpen: null, byCriterion: [] },
      backAndForth: { returns: 0, averageAnswerDays: null, byRequest: [] },
    });
  });
});

describe('AnalyticsService and routes [R1-11, R1-12, R1-14, NFR-SEC-01]', () => {
  interface Fake {
    facts: Mock<AnalyticsRepository['facts']>;
  }
  const fake = (): Fake => ({
    facts: vi.fn<AnalyticsRepository['facts']>(() => Promise.resolve(facts())),
  });
  const service = (repository: Fake = fake()) =>
    new AnalyticsService(new IncrementRequestService(workingRepository()), repository, () => NOW);

  it('serves Sirius HR the measures for its filters', async () => {
    const repository = fake();
    const result = await service(repository).increments(reviewer, {
      cycleId: CYCLE_ID,
      criterion: 'C1',
    });
    expect(result.tat.byCriterion.map((row) => row.code)).toEqual(['C1']);
    expect(IncrementAnalyticsSchema.parse(result).generatedAt).toBe(NOW.toISOString());
    expect(repository.facts).toHaveBeenCalledWith(
      { userId: 'reviewer', userName: 'Reviewer', kind: 'group' },
      { cycleId: CYCLE_ID },
    );
  });

  it('builds RP-02 as an Excel workbook that reads back, naming the filters, audited', async () => {
    const repository = fake();
    const file = await service(repository).tatReport(reviewer, {
      format: 'xlsx',
      locale: 'en',
      cycleId: CYCLE_ID,
      entityId: SUB_A,
    });
    expect(file).toMatchObject({
      fileName: 'PeopleForge-RP-02-2026-10-18.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(repository.facts.mock.calls[0]?.[2]).toEqual({ report: 'RP-02', format: 'xlsx' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Summary',
      'TAT by request',
      'TAT by criterion',
      'TAT trend',
      'TAT by subsidiary',
      'Back-and-forth',
      'Back-and-forth by subsidiary',
    ]);
    const summary = workbook.getWorksheet('Summary');
    expect(summary?.getCell('A1').value).toBe('RP-02 · Turnaround time and back-and-forth');
    expect(summary?.getCell('A3').value).toBe(
      'Filters: Period: Increment cycle 2026 · Subsidiary: SUB-A',
    );
    expect(summary?.getCell('B7').value).toBe(2.8);
    expect(workbook.getWorksheet('TAT by request')?.getRow(2).values).toEqual([
      undefined,
      'INC-2026-0001',
      'SUB-A',
      'Partly approved',
      2,
      '10 Oct 2026, 12:00',
      '15 Oct 2026, 00:00',
      4.5,
      'No',
    ]);
    expect(workbook.getWorksheet('TAT by criterion')?.getRow(2).values).toEqual([
      undefined,
      'C1',
      2,
      0.8,
      0.8,
      1,
    ]);
    expect(summary?.getCell('B8').value).toBe(2.8);
    expect(workbook.getWorksheet('TAT trend')?.getRow(13).values).toEqual([
      undefined,
      '2026-10',
      2,
      2.8,
      2.8,
    ]);
    // Open requests: "Yes", no decision date.
    expect(workbook.getWorksheet('TAT by request')?.getRow(3).getCell(8).value).toBe('Yes');
  });

  it('names unknown filters plainly and words an unfiltered report', async () => {
    const repository = fake();
    repository.facts.mockResolvedValue({
      requests: [],
      verifications: [],
      returns: [],
      messages: [],
    });
    const filtered = await service(repository).tatReport(reviewer, {
      format: 'xlsx',
      locale: 'ar',
      cycleId: '11111111-1111-4111-8111-111111111112',
      entityId: SUB_A,
    });
    let workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(filtered.body as unknown as ArrayBuffer);
    expect(workbook.getWorksheet('Summary')?.getCell('A3').value).toBe(
      'Filters: Period: 11111111-1111-4111-8111-111111111112 · Subsidiary: —',
    );
    const one = await service(repository).tatReport(reviewer, {
      format: 'xlsx',
      locale: 'en',
      criterion: 'C3',
    });
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(one.body as unknown as ArrayBuffer);
    expect(workbook.getWorksheet('Summary')?.getCell('A3').value).toBe('Filters: criterion C3');
    // The criterion narrows the measures, not the facts read.
    expect(repository.facts.mock.calls.at(-1)?.[1]).toEqual({});
    const all = await service(repository).tatReport(reviewer, { format: 'xlsx', locale: 'en' });
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(all.body as unknown as ArrayBuffer);
    expect(workbook.getWorksheet('Summary')?.getCell('A3').value).toBe(
      'Filters: none (every subsidiary, every period)',
    );
  });

  it('refuses a subsidiary (403), executives and anonymous callers', async () => {
    await expect(service().increments(alphaHr, {})).rejects.toMatchObject({ status: 403 });
    const http = async (caller: Parameters<typeof resolveAs>[0] | null) =>
      (
        await buildApp({
          resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
          incrementRequests: workingRepository(),
          analytics: fake(),
        })
      ).getHttpServer();
    expect(
      errorOf(
        await request(await http(null))
          .get('/api/v1/analytics/increments')
          .expect(401),
      ).code,
    ).toBe('UNAUTHENTICATED');
    await request(await http(executive))
      .get('/api/v1/analytics/increments')
      .expect(403);
    expect(
      errorOf(
        await request(await http(alphaHr))
          .get('/api/v1/analytics/increments')
          .expect(403),
      ).code,
    ).toBe('FORBIDDEN');
    await request(await http(alphaHr))
      .get('/api/v1/reports/tat-back-and-forth?format=xlsx')
      .expect(403);
  });

  it('answers Sirius HR, validates filters, and sends RP-02 as an uncached attachment', async () => {
    const app = await buildApp({
      resolvePrincipal: resolveAs(reviewer),
      incrementRequests: workingRepository(),
      analytics: fake(),
    });
    const http = app.getHttpServer();
    const res = await request(http)
      .get(`/api/v1/analytics/increments?entityId=${SUB_A}`)
      .expect(200);
    expect(IncrementAnalyticsSchema.parse(res.body).tat.requests).toBe(3);
    await request(http).get('/api/v1/analytics/increments?cycleId=q3').expect(400);
    await request(http).get('/api/v1/analytics/increments?criterion=C1').expect(200);
    await request(http).get('/api/v1/analytics/increments?criterion=1%3D1').expect(400);
    const file = await request(http)
      .get('/api/v1/reports/tat-back-and-forth?format=xlsx&locale=en')
      .buffer(true)
      .expect(200);
    expect(file.headers['content-disposition']).toContain('PeopleForge-RP-02-');
    expect(file.headers['cache-control']).toBe('private, no-store');
    await request(http).get('/api/v1/reports/tat-back-and-forth?format=pdf').expect(400);
  });

  it('keeps the shared fake honest', async () => {
    await expect(unusedAnalytics.facts({ userId: 'x', kind: 'group' }, {})).rejects.toThrow();
  });
});
