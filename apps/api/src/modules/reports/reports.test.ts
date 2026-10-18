import ExcelJS from 'exceljs';
import type { ReportLineRecord, ReportRepository } from '@peopleforge/db';
import { ROLES } from '@peopleforge/contracts';
import request from 'supertest';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { apiTranslator, unknownApiKeys } from '../../i18n.js';
import {
  anonymous,
  buildApp,
  errorOf,
  resolveAs,
  SUB_A,
  unusedReports,
} from '../../test-support/factory.js';
import {
  alphaHr,
  CYCLE_ID,
  executive,
  REQUEST_ID,
  reviewer,
  workingRepository,
} from '../../test-support/increment-requests.js';
import { IncrementRequestService } from '../increment-requests/increment-request.service.js';
import { fontFor, incrementPdf } from './pdf.js';
import { reportContent, tatDays } from './report-content.js';
import { reportLabels } from './report-labels.js';
import { ReportService } from './report.service.js';
import { incrementWorkbook, safeText } from './xlsx.js';

// The increment status report (RP-01, R1-14): content, Excel, PDF, the service and the route.
// Synthetic data only.
const NOW = new Date('2026-10-17T08:00:00Z');
const SUBMITTED = new Date('2026-10-10T06:00:00Z');
const DECIDED = new Date('2026-10-15T06:00:00Z');
const OTHER = '11111111-1111-4111-8111-111111111112';

function line(overrides: Partial<ReportLineRecord> = {}): ReportLineRecord {
  return {
    request: {
      id: REQUEST_ID,
      reference: 'INC-2026-0152',
      status: 'partly_approved',
      entityCode: 'SUB-A',
      createdAt: SUBMITTED,
      submittedAt: SUBMITTED,
      decidedAt: DECIDED,
    },
    employeeNumber: 'EMP-1101',
    fullName: 'Aisha Rahman',
    grade: 'G5',
    currency: 'AED',
    currentSalary: '14200.00',
    proposedKind: 'percent',
    proposedValue: '5.00',
    reviewStatus: 'approved',
    decision: { decision: 'approved', approved: { kind: 'percent', value: '4.50' } },
    ...overrides,
  };
}

const LINES: ReportLineRecord[] = [
  line(),
  line({
    employeeNumber: 'EMP-1102',
    fullName: 'Yusuf Karim',
    currentSalary: '16800.00',
    reviewStatus: 'rejected',
    decision: { decision: 'rejected', approved: null },
  }),
  line({
    request: {
      id: OTHER,
      reference: 'INC-2026-0153',
      status: 'under_review',
      entityCode: 'SUB-A',
      createdAt: SUBMITTED,
      submittedAt: SUBMITTED,
      decidedAt: null,
    },
    employeeNumber: 'EMP-1103',
    fullName: '=HYPERLINK("x")',
    reviewStatus: 'pending',
    decision: null,
  }),
  line({
    request: {
      id: '11111111-1111-4111-8111-111111111113',
      reference: 'INC-2026-0154',
      status: 'draft',
      entityCode: 'SUB-A',
      createdAt: SUBMITTED,
      submittedAt: null,
      decidedAt: null,
    },
    employeeNumber: 'EMP-1104',
    fullName: 'عائشة رحمن',
    proposedKind: null,
    proposedValue: null,
    reviewStatus: 'pending',
    decision: { decision: 'approved', approved: null },
  }),
];

const t = apiTranslator('en');
const labels = (truncatedAt: number | null = null) =>
  reportLabels(t, 'en', {
    generatedAt: NOW,
    by: 'Sara Al Mansoori',
    filters: 'none',
    truncatedAt,
  });

describe('report content [R1-14]', () => {
  it('counts calendar days from submission to decision, or to now while open', () => {
    expect(tatDays(SUBMITTED, DECIDED, NOW)).toBe(5);
    expect(tatDays(SUBMITTED, null, NOW)).toBe(7);
    expect(tatDays(null, null, NOW)).toBeNull();
    expect(tatDays(NOW, SUBMITTED, NOW)).toBe(0);
  });

  it('gives each employee their figures as decided, and each request its counts', () => {
    const content = reportContent(LINES, false, NOW);
    const [aisha, yusuf, open, draft] = content.employees;
    // 4.5% of AED 14,200 instead of the proposed 5%.
    expect(aisha).toMatchObject({
      proposedPercent: '5.00',
      approvedPercent: '4.50',
      increase: '639.00',
      tatDays: 5,
    });
    // Rejected: no increase at all (never "AED 0").
    expect(yusuf).toMatchObject({ approvedPercent: null, increase: null });
    expect(open).toMatchObject({ approvedPercent: null, increase: '710.00', tatDays: 7 });
    expect(draft).toMatchObject({ proposedPercent: null, increase: null, tatDays: null });
    expect(content.requests).toHaveLength(3);
    expect(content.requests[0]).toMatchObject({
      reference: 'INC-2026-0152',
      employees: 2,
      byStatus: { pending: 0, approved: 1, rejected: 1, returned: 0 },
      tatDays: 5,
    });
    expect(content.counts).toEqual({
      draft: 1,
      submitted: 0,
      under_review: 1,
      returned: 0,
      approved: 0,
      partly_approved: 1,
      rejected: 0,
    });
  });

  it('approves at the proposal when no other increment was given', () => {
    const [row] = reportContent(
      [line({ decision: { decision: 'approved', approved: null } })],
      false,
      NOW,
    ).employees;
    expect(row).toMatchObject({ approvedPercent: '5.00', increase: '710.00' });
    // An approved employee whose decision isn't readable shows no figures rather than wrong ones.
    const [unknown] = reportContent([line({ decision: null })], false, NOW).employees;
    expect(unknown).toMatchObject({ approvedPercent: null, increase: null });
  });
});

describe('Excel [R1-14, NFR-INT-01]', () => {
  it('neutralises formula injection in every text cell', () => {
    for (const text of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(safeText(text)).toBe(`'${text}`);
    }
    expect(safeText('INC-2026-0152')).toBe('INC-2026-0152');
  });

  it('builds Summary, Requests and Employees sheets that read back', async () => {
    const buffer = await incrementWorkbook(reportContent(LINES, true, NOW), labels(4));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Summary',
      'Requests',
      'Employees',
    ]);
    const summary = workbook.getWorksheet('Summary');
    expect(summary?.getCell('A1').value).toBe('RP-01 · Increment requests — status report');
    expect(summary?.getCell('A2').value).toBe('Generated 17 Oct 2026, 12:00 by Sara Al Mansoori');
    expect(summary?.getCell('A4').value).toMatch(/^Only the first 4 employees/u);
    const employees = workbook.getWorksheet('Employees');
    expect(employees?.getRow(1).getCell(4).value).toBe('Employee');
    expect(employees?.getRow(2).getCell(8).value).toBe(4.5);
    expect(employees?.getRow(2).getCell(10).value).toBe(639);
    expect(employees?.getRow(3).getCell(10).value).toBeNull();
    // The injected name is text, never a formula.
    expect(employees?.getRow(4).getCell(4).value).toBe(`'=HYPERLINK("x")`);
    expect(employees?.getRow(5).getCell(4).value).toBe('عائشة رحمن');
    expect(employees?.getRow(5).getCell(12).value).toBe('—');
    expect(workbook.getWorksheet('Requests')?.getRow(2).getCell(11).value).toBe(5);
  });
});

describe('PDF [R1-14, RP-01]', () => {
  it('chooses a font with the glyphs', () => {
    expect(fontFor('Aisha')).toBe('regular');
    expect(fontFor('Aisha', true)).toBe('bold');
    expect(fontFor('عائشة')).toBe('arabic');
  });

  it('lays out the report across pages, and says when nothing matches', async () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      line({
        request: {
          ...line().request,
          id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
          reference: `INC-2026-${String(index).padStart(4, '0')}`,
        },
      }),
    );
    const pdf = await incrementPdf(reportContent([...LINES, ...many], true, NOW), labels(64));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/gu) ?? []).length).toBeGreaterThan(1);
    const empty = await incrementPdf(reportContent([], false, NOW), labels());
    expect(empty.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('ReportService [R1-14, R1-15]', () => {
  interface Fake {
    incrementLines: Mock<ReportRepository['incrementLines']>;
  }

  function service(lines = LINES): { service: ReportService; repository: Fake } {
    const repository: Fake = {
      incrementLines: vi.fn<ReportRepository['incrementLines']>(() =>
        Promise.resolve({ lines, truncated: false }),
      ),
    };
    return {
      repository,
      service: new ReportService(
        new IncrementRequestService(workingRepository()),
        repository,
        () => NOW,
      ),
    };
  }

  it('builds the Excel file for the caller’s scope, naming the filters', async () => {
    const { service: reports, repository } = service();
    const file = await reports.incrementReport(alphaHr, {
      format: 'xlsx',
      locale: 'en',
      cycleId: CYCLE_ID,
      entityId: SUB_A,
      status: 'approved',
      search: 'Aisha',
    });
    expect(file).toMatchObject({
      fileName: 'PeopleForge-RP-01-2026-10-17.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(repository.incrementLines.mock.calls[0]?.slice(1)).toEqual([
      {
        cycleId: CYCLE_ID,
        entityId: SUB_A,
        status: 'approved',
        search: 'Aisha',
        includeDrafts: true,
      },
      { report: 'RP-01', format: 'xlsx' },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as unknown as ArrayBuffer);
    expect(workbook.getWorksheet('Summary')?.getCell('A3').value).toBe(
      'Filters: Period: Increment cycle 2026 · Subsidiary: SUB-A · Status: Approved · Search: Aisha',
    );
  });

  it('builds a PDF for Sirius HR without drafts, with unknown filters shown plainly', async () => {
    const { service: reports, repository } = service([]);
    const file = await reports.incrementReport(reviewer, {
      format: 'pdf',
      locale: 'ar',
      cycleId: OTHER,
      entityId: SUB_A,
    });
    expect(file).toMatchObject({
      contentType: 'application/pdf',
      fileName: 'PeopleForge-RP-01-2026-10-17.pdf',
    });
    expect(repository.incrementLines.mock.calls[0]?.[1]).toMatchObject({ includeDrafts: false });
    await reports.incrementReport(reviewer, { format: 'pdf', locale: 'en' });
    repository.incrementLines.mockResolvedValueOnce({ lines: LINES, truncated: true });
    const cut = await reports.incrementReport(reviewer, { format: 'xlsx', locale: 'en' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(cut.body as unknown as ArrayBuffer);
    expect(workbook.getWorksheet('Summary')?.getCell('A4').value).toMatch(/^Only the first 4/u);
  });
});

describe('report route [R1-14, NFR-SEC-01]', () => {
  const path = '/api/v1/reports/increment-requests?format=xlsx';

  async function server(caller: Parameters<typeof resolveAs>[0] | null) {
    const app = await buildApp({
      resolvePrincipal: caller === null ? anonymous : resolveAs(caller),
      incrementRequests: workingRepository(),
      reports: { incrementLines: () => Promise.resolve({ lines: LINES, truncated: false }) },
    });
    return app.getHttpServer();
  }

  it('refuses no session (401) and a role without reports (403)', async () => {
    expect(
      errorOf(
        await request(await server(null))
          .get(path)
          .expect(401),
      ).code,
    ).toBe('UNAUTHENTICATED');
    await request(await server(executive))
      .get(path)
      .expect(403);
    // An admin may read operational reports but not pay: RP-01 holds increments (NFR-PRIV-01).
    expect(
      errorOf(
        await request(await server({ ...reviewer, userId: 'admin', roles: [ROLES.admin] }))
          .get(path)
          .expect(403),
      ).code,
    ).toBe('FORBIDDEN');
  });

  it('sends the file as an attachment, never cached, and refuses a bad format', async () => {
    const res = await request(await server(reviewer))
      .get(path)
      .buffer(true)
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('PeopleForge-RP-01-');
    expect(res.headers['cache-control']).toBe('private, no-store');
    await request(await server(reviewer))
      .get('/api/v1/reports/increment-requests?format=csv')
      .expect(400);
  });

  it('keeps the message files and the shared fake honest', async () => {
    expect(unknownApiKeys('ar')).toEqual([]);
    await expect(
      unusedReports.incrementLines(
        { userId: 'x', kind: 'group' },
        { includeDrafts: false },
        { report: 'RP-01', format: 'pdf' },
      ),
    ).rejects.toThrow();
  });
});
