import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import {
  getEmployeeHistory,
  getFlag,
  getTemplate,
  getUpload,
  listEmployees,
  listFlags,
  listUploads,
} from '@/server/group-data';
import type * as GroupData from '@/server/group-data';
import { requireViewer } from '@/server/session';
import {
  ADMIN,
  ALPHA_HR,
  COMPARISON,
  EXECUTIVE,
  employeeHistory,
  employeePage,
  employeeRecord,
  FLAG_2,
  FLAG_ID,
  fieldTemplate,
  flag,
  flagDetail,
  flagPage,
  RECORD_ID,
  REVIEWER,
  SUB_A,
  UPLOAD_ID,
  uploadDetail,
  uploadPage,
} from '@/test-support/group';
import EmployeeHistoryPage from './employees/[id]/page';
import EmployeesPage from './employees/page';
import ExtractPage from './extract/page';
import FlagPage from './quality/flags/[id]/page';
import QualityPage from './quality/page';
import UploadPage from './upload/page';
import UploadResultPage from './uploads/[id]/page';
import UploadsPage from './uploads/page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/app/(portal)/group/actions', () => ({
  uploadGroupDataAction: vi.fn(),
  updateFlagAction: vi.fn(),
  remindFlagAction: vi.fn(),
}));
vi.mock('@/server/group-data', async (importOriginal) => {
  const actual = await importOriginal<typeof GroupData>();
  return {
    required: actual.required,
    getEmployeeHistory: vi.fn(),
    getFlag: vi.fn(),
    getTemplate: vi.fn(),
    getUpload: vi.fn(),
    listEmployees: vi.fn(),
    listFlags: vi.fn(),
    listUploads: vi.fn(),
  };
});
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  useRouter: () => ({ push: vi.fn() }),
}));

// The group data pages (R2-01 … R2-14): what each role sees, in words, with every state.

const ok = <T,>(data: T) => ({ kind: 'ok' as const, data });
const search = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) });
const id = (value: string) => ({ params: Promise.resolve({ id: value }) });

function as(me: Me | null) {
  vi.mocked(requireViewer).mockResolvedValue(me);
}

beforeEach(() => {
  cleanup();
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  as(ALPHA_HR);
  vi.mocked(getTemplate).mockResolvedValue(ok(fieldTemplate()));
  vi.mocked(listUploads).mockResolvedValue(ok(uploadPage()));
  vi.mocked(getUpload).mockResolvedValue(ok(uploadDetail()));
  vi.mocked(listEmployees).mockResolvedValue(ok(employeePage()));
  vi.mocked(getEmployeeHistory).mockResolvedValue(ok(employeeHistory()));
  vi.mocked(listFlags).mockResolvedValue(ok(flagPage()));
  vi.mocked(getFlag).mockResolvedValue(ok(flagDetail()));
});

describe('access [R2-12, NFR-SEC-01]', () => {
  it.each([
    ['upload', () => UploadPage()],
    ['uploads', () => UploadsPage()],
    ['result', () => UploadResultPage(id(UPLOAD_ID))],
    ['employees', () => EmployeesPage()],
    ['history', () => EmployeeHistoryPage(id(RECORD_ID))],
    ['quality', () => QualityPage()],
    ['flag', () => FlagPage(id(FLAG_ID))],
    ['extract', () => ExtractPage()],
  ])(
    'the %s page is not found without the permission, empty when signed out',
    async (_name, page) => {
      as(EXECUTIVE);
      await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
      as(null);
      await expect(page()).resolves.toBeNull();
    },
  );

  it('refuses malformed IDs as not found', async () => {
    as(REVIEWER);
    await expect(UploadResultPage(id('x'))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(EmployeeHistoryPage(id('x'))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(FlagPage(id('x'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('keeps raw extraction to Sirius HR', async () => {
    await expect(ExtractPage()).rejects.toThrow('NEXT_NOT_FOUND');
    as(ADMIN);
    await expect(UploadPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('Upload employee data [R2-01]', () => {
  it('offers the template, the upload form for the own subsidiary and the latest uploads', async () => {
    render(await UploadPage());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Upload employee data' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download template' })).toHaveAttribute(
      'href',
      '/group/template',
    );
    const form = screen.getByRole('form', { name: 'Upload a month' });
    // One subsidiary: no choice to make.
    expect(within(form).queryByLabelText(/Subsidiary/u)).toBeNull();
    expect(within(form).getByLabelText(/Month/u)).toHaveValue('2026-09');
    expect(
      screen.getByText(/Template version 1 \(since 1 Oct 2026\): 4 columns, 3 required/u),
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Latest uploads' })).toHaveTextContent('UP-0007');
  });

  it('shows an empty state, and a template not yet dated', async () => {
    vi.mocked(listUploads).mockResolvedValue(ok(uploadPage([])));
    vi.mocked(getTemplate).mockResolvedValue(ok(fieldTemplate({ activatedAt: null })));
    render(await UploadPage());
    expect(screen.getByText('No uploads yet')).toBeInTheDocument();
    expect(screen.getByText(/since —/u)).toBeInTheDocument();
  });
});

describe('Uploads [R2-01, R2-04]', () => {
  it('lists uploads with filters; a subsidiary user has no subsidiary filter', async () => {
    render(await UploadsPage(search({ period: '2026-09' })));
    const table = screen.getByRole('table', { name: 'Uploads' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('In use');
    expect(screen.queryByLabelText('Subsidiary')).toBeNull();
    expect(listUploads).toHaveBeenCalledWith({ entityId: undefined, period: '2026-09', page: 1 });
  });

  it('pages, and goes back to the last page past the end', async () => {
    as(REVIEWER);
    vi.mocked(listUploads).mockResolvedValue(ok({ ...uploadPage(), total: 30 }));
    render(await UploadsPage(search({ page: '2' })));
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument();
    expect(screen.getByLabelText('Subsidiary')).toBeInTheDocument();
    await expect(UploadsPage(search({ page: '9' }))).rejects.toThrow(
      'NEXT_REDIRECT /group/uploads?page=3',
    );
  });

  it('shows an empty state', async () => {
    vi.mocked(listUploads).mockResolvedValue(ok(uploadPage([])));
    render(await UploadsPage());
    expect(screen.getByText('No uploads yet')).toBeInTheDocument();
  });
});

describe('Upload result [R2-01, R2-02, R2-09]', () => {
  it('shows an accepted version, its comparison, flags and problems', async () => {
    render(await UploadResultPage(id(UPLOAD_ID)));
    expect(
      screen.getByRole('heading', { level: 1, name: 'UP-0007 · SUB-A · September 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Accepted as version 2')).toBeInTheDocument();
    expect(screen.getByTestId('compare-headcount')).toHaveTextContent('405 → 412');
    expect(screen.getByRole('link', { name: 'View 3 flags' })).toHaveAttribute(
      'href',
      `/group/quality?period=2026-09&entity=${SUB_A}`,
    );
    expect(screen.getByRole('link', { name: 'Original file' })).toHaveAttribute(
      'href',
      `/group/uploads/${UPLOAD_ID}/file`,
    );
    expect(screen.getByRole('table', { name: 'Problems found' })).toHaveTextContent('Header row');
    expect(screen.queryByRole('link', { name: 'Upload a corrected file' })).toBeNull();
  });

  it('shows a rejected file with every problem and a way to upload again', async () => {
    vi.mocked(getUpload).mockResolvedValue(
      ok(
        uploadDetail({
          status: 'rejected',
          version: null,
          comparison: null,
          flags: 0,
          errors: 300,
          issues: [{ row: 5, field: 'employee_number', code: 'required', severity: 'error' }],
          issuesTotal: 300,
        }),
      ),
    );
    vi.mocked(getRequestLocale).mockResolvedValue('ar');
    render(await UploadResultPage(id(UPLOAD_ID)));
    expect(screen.getByRole('table')).toHaveTextContent('رقم الموظف');
    expect(screen.getByRole('link', { name: 'Upload a corrected file' })).toHaveAttribute(
      'href',
      '/group/upload',
    );
  });

  it('marks a replaced version, the first month, warnings, and hides upload again from readers', async () => {
    as(REVIEWER);
    vi.mocked(getUpload).mockResolvedValue(
      ok(
        uploadDetail({
          status: 'superseded',
          flags: 0,
          issues: [],
          comparison: {
            ...COMPARISON,
            previousPeriod: null,
            warnings: ['headcount_change', 'payroll_change'],
          },
        }),
      ),
    );
    render(await UploadResultPage(id(UPLOAD_ID)));
    expect(screen.getByText(/A later version has replaced it/u)).toBeInTheDocument();
    expect(screen.getByText(/first month/u)).toBeInTheDocument();
    expect(screen.getByText(/Headcount moved more than the threshold/u)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View .* flags/u })).toBeNull();
    vi.mocked(getUpload).mockResolvedValue(
      ok(uploadDetail({ status: 'rejected', version: null, comparison: null })),
    );
    cleanup();
    render(await UploadResultPage(id(UPLOAD_ID)));
    expect(screen.queryByRole('link', { name: 'Upload a corrected file' })).toBeNull();
  });
});

describe('Employee data [R2-03, R2-04]', () => {
  it('lists the month records with cards, filters and history links', async () => {
    as(REVIEWER);
    render(await EmployeesPage(search({ period: '2026-09', q: 'aisha' })));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/Version 2 · 0?5 Oct 2026/u)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Employee data' });
    expect(within(table).getByRole('link', { name: 'Aisha Rahman' })).toHaveAttribute(
      'href',
      `/group/employees/${RECORD_ID}`,
    );
    expect(table).toHaveTextContent('AED 14,200');
    expect(screen.getByLabelText('Subsidiary')).toBeInTheDocument();
  });

  it('hides pay without access, says when nothing has changed, pages and is empty', async () => {
    vi.mocked(listEmployees).mockResolvedValue(
      ok(
        employeePage([employeeRecord({ grossSalary: null, status: 'left' })], {
          total: 60,
          summary: { entities: 1, entitiesWithData: 0, versions: 0, lastChange: null },
        }),
      ),
    );
    render(await EmployeesPage(search({ page: '2' })));
    expect(screen.getByRole('table')).toHaveTextContent('—');
    expect(screen.getByRole('table')).toHaveTextContent('Left');
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument();
    await expect(EmployeesPage(search({ page: '9' }))).rejects.toThrow('NEXT_REDIRECT');
    vi.mocked(listEmployees).mockResolvedValue(ok(employeePage([])));
    cleanup();
    render(await EmployeesPage());
    expect(screen.getByText('No records for this month')).toBeInTheDocument();
  });
});

describe('Employee history [R2-04, R2-13]', () => {
  it('lists every version with what changed', async () => {
    render(await EmployeeHistoryPage(id(RECORD_ID)));
    expect(screen.getByRole('heading', { level: 1, name: 'Aisha Rahman' })).toBeInTheDocument();
    const versions = screen.getByRole('list', { name: 'Versions' });
    expect(within(versions).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('table', { name: 'September 2026 · version 2' })).toHaveTextContent(
      '14200.00',
    );
    expect(screen.getByText('No change from the version before.')).toBeInTheDocument();
    expect(screen.getByText('First record of this employee.')).toBeInTheDocument();
  });

  it('shows the employee ID when no version is listed, in Arabic labels', async () => {
    vi.mocked(getRequestLocale).mockResolvedValue('ar');
    vi.mocked(getEmployeeHistory).mockResolvedValue(ok({ ...employeeHistory(), versions: [] }));
    render(await EmployeeHistoryPage(id(RECORD_ID)));
    expect(screen.getByRole('heading', { level: 1, name: 'EMP-1101' })).toBeInTheDocument();
  });
});

describe('Data quality [DASH-D7, R2-09 … R2-11]', () => {
  it('shows counts, bars per subsidiary, variations and flags', async () => {
    as(REVIEWER);
    render(await QualityPage(search({ period: '2026-09' })));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Data quality & anomalies' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Flags by subsidiary' })).toHaveTextContent(
      'Open 3 · In progress 1 · Resolved 5',
    );
    const variations = screen.getByRole('table', { name: 'Variation vs previous month' });
    expect(variations).toHaveTextContent('405 → 412');
    expect(variations).toHaveTextContent('SUB-B');
    const flags = screen.getByRole('table', { name: 'Flags' });
    expect(within(flags).getByRole('link', { name: 'AN-0042' })).toHaveAttribute(
      'href',
      `/group/quality/flags/${FLAG_ID}`,
    );
    expect(flags).toHaveTextContent('Hassan Ali · EMP-3318');
    expect(screen.getByLabelText('Rule')).toHaveTextContent(
      'ANM-05 · Salary differs from the approved increment',
    );
  });

  it('covers every month, empty lists, whole-subsidiary flags and pages', async () => {
    vi.mocked(listFlags).mockResolvedValue(
      ok(
        flagPage([flag({ employeeName: null, employeeNumber: null })], {
          total: 30,
          byEntity: [],
          variations: [],
          oldestOpenAt: null,
        }),
      ),
    );
    render(await QualityPage(search({ period: 'all', page: '2' })));
    expect(screen.getByText('Anomaly flags across all months.')).toBeInTheDocument();
    expect(screen.getByText('No flags.')).toBeInTheDocument();
    expect(screen.getByText('Choose a month to compare subsidiaries.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Flags' })).toHaveTextContent('Whole subsidiary');
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument();
    await expect(QualityPage(search({ page: '9' }))).rejects.toThrow('NEXT_REDIRECT');
    vi.mocked(listFlags).mockResolvedValue(ok(flagPage([], { total: 0, variations: [] })));
    cleanup();
    render(await QualityPage());
    expect(screen.getByText('No flags')).toBeInTheDocument();
    expect(screen.getByText('No accepted uploads for this month yet.')).toBeInTheDocument();
  });
});

describe('Flag detail [R2-10, R2-11]', () => {
  it('shows the values, the resolution form with owners, activity and navigation', async () => {
    as(REVIEWER);
    render(await FlagPage(id(FLAG_ID)));
    expect(
      screen.getByRole('heading', { level: 1, name: 'AN-0042 · Hassan Ali · EMP-3318' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('detail-expected')).toHaveTextContent('14,910');
    expect(screen.getByRole('link', { name: 'Next flag' })).toHaveAttribute(
      'href',
      `/group/quality/flags/${FLAG_2}`,
    );
    expect(screen.queryByRole('link', { name: 'Previous flag' })).toBeNull();
    const form = screen.getByRole('form', { name: 'Resolution' });
    expect(within(form).getByLabelText('Owner')).toHaveTextContent('Priya Nair');
    expect(within(form).getByLabelText('Owner')).toHaveTextContent('Me');
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    expect(screen.getByText('Status In progress · owner Priya Nair')).toBeInTheDocument();
    expect(screen.getByText(/PeopleForge ·/u)).toBeInTheDocument();
  });

  it('closes a superseded flag to changes and shows its note; a subsidiary user sends no reminder', async () => {
    vi.mocked(getFlag).mockResolvedValue(
      ok(
        flagDetail({
          flag: flag({
            status: 'resolved',
            resolvedReason: 'superseded',
            resolvedAt: '2026-10-07T06:00:00.000Z',
            employeeName: null,
            employeeNumber: null,
            detail: {},
          }),
          previousId: FLAG_2,
          nextId: null,
          owners: [{ id: 'oid-alpha', name: 'Priya Nair' }],
        }),
      ),
    );
    render(await FlagPage(id(FLAG_ID)));
    expect(screen.getByText(/replaced the upload that raised this flag/u)).toBeInTheDocument();
    expect(screen.getByText('No resolution note yet.')).toBeInTheDocument();
    expect(
      screen.getByText('Closed: the data was replaced by a newer version.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous flag' })).toBeInTheDocument();
    vi.mocked(getFlag).mockResolvedValue(
      ok(flagDetail({ flag: flag({ detail: {}, note: 'Checked' }) })),
    );
    cleanup();
    render(await FlagPage(id(FLAG_ID)));
    expect(screen.getByText('Values are shown to people with access to pay.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send reminder' })).toBeNull();
  });

  it('shows the note read-only to readers who cannot resolve', async () => {
    as({ ...REVIEWER, permissions: ['employee_data:read'] });
    vi.mocked(getFlag).mockResolvedValue(
      ok(flagDetail({ flag: flag({ note: 'Checked with payroll.' }) })),
    );
    render(await FlagPage(id(FLAG_ID)));
    expect(screen.getByText('Checked with payroll.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Resolution' })).toBeNull();
  });
});

describe('Raw data extract [R2-08, R2-14]', () => {
  it('defaults to last month in Excel', async () => {
    as(REVIEWER);
    render(await ExtractPage());
    expect(screen.getByLabelText('Format')).toHaveValue('xlsx');
  });

  it('offers month, subsidiary, format and replaced versions as a download form', async () => {
    as(REVIEWER);
    render(await ExtractPage(search({ format: 'csv', allVersions: 'true' })));
    const form = screen.getByRole('form', { name: 'Extract' });
    expect(form).toHaveAttribute('action', '/group/extract/download');
    expect(within(form).getByLabelText('Format')).toHaveValue('csv');
    expect(within(form).getByLabelText('Include replaced versions')).toBeChecked();
    expect(within(form).getByLabelText('Subsidiary')).toHaveTextContent('All subsidiaries');
  });
});
