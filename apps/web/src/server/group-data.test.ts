import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_ID, RECORD_ID, SUB_A, UPLOAD_ID } from '@/test-support/group';
import {
  downloadExtract,
  downloadGroupReport,
  downloadTemplate,
  downloadUploadFile,
  downloadUploadIssues,
  getAnomalyRules,
  getCompensation,
  getExecutiveView,
  getGroupOverview,
  getEmployeeHistory,
  getFlag,
  getTemplate,
  getTemplateSettings,
  getUpload,
  listEmployees,
  listFlags,
  listUploads,
  publishTemplate,
  remindFlagOwner,
  required,
  updateAnomalyRule,
  updateFlag,
  uploadGroupData,
} from './group-data';
import { REPORT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from './increment-requests';
import { callApi, downloadFromApi } from './session';

vi.mock('./session', () => ({ callApi: vi.fn(), downloadFromApi: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

beforeEach(() => {
  vi.mocked(callApi).mockResolvedValue({ kind: 'unavailable' });
  vi.mocked(downloadFromApi).mockResolvedValue({ kind: 'unavailable' });
});

describe('group data client [R2-01 … R2-14]', () => {
  it('calls the documented paths with validated IDs and only the values set', async () => {
    const form = new FormData();
    await getTemplate();
    await uploadGroupData(form);
    await listUploads({ page: 1 });
    await listUploads({ entityId: SUB_A, period: '2026-09', page: 2, pageSize: 25 });
    await getUpload(UPLOAD_ID);
    await listEmployees({ period: '2026-09', page: 1, pageSize: 25 });
    await listEmployees({
      period: '2026-09',
      entityId: SUB_A,
      department: 'Finance & Co',
      search: 'aisha',
      page: 1,
      pageSize: 25,
    });
    await getEmployeeHistory(RECORD_ID);
    await listFlags({ page: 1 });
    await listFlags({
      period: '2026-09',
      entityId: SUB_A,
      status: 'open',
      rule: 'ANM-03',
      page: 2,
    });
    await getFlag(FLAG_ID);
    await updateFlag(FLAG_ID, { ownerId: null, status: 'resolved', note: 'Checked.' });
    await remindFlagOwner(FLAG_ID);
    await getTemplateSettings();
    await publishTemplate({ version: 1, fields: [] });
    await getAnomalyRules();
    await updateAnomalyRule('ANM-03', { threshold: '25', enabled: true });
    await getGroupOverview({ period: '2026-09' });
    await getGroupOverview({ period: '2026-09', entityId: SUB_A, department: 'Finance' });
    await getCompensation({ period: '2026-09' });
    await getCompensation({ period: '2026-09', entityId: SUB_A, department: 'Sales' });
    await getExecutiveView('2026-09');
    expect(vi.mocked(callApi).mock.calls.map(([path, , init]) => [path, init])).toEqual([
      ['/api/v1/group/template', undefined],
      ['/api/v1/group/uploads', { method: 'POST', form, timeoutMs: UPLOAD_TIMEOUT_MS }],
      ['/api/v1/group/uploads?page=1', undefined],
      [`/api/v1/group/uploads?entityId=${SUB_A}&period=2026-09&page=2&pageSize=25`, undefined],
      [`/api/v1/group/uploads/${UPLOAD_ID}`, undefined],
      ['/api/v1/group/employees?period=2026-09&page=1&pageSize=25', undefined],
      [
        `/api/v1/group/employees?period=2026-09&entityId=${SUB_A}&department=Finance+%26+Co&search=aisha&page=1&pageSize=25`,
        undefined,
      ],
      [`/api/v1/group/employees/${RECORD_ID}/history`, undefined],
      ['/api/v1/group/flags?page=1', undefined],
      [
        `/api/v1/group/flags?period=2026-09&entityId=${SUB_A}&status=open&rule=ANM-03&page=2`,
        undefined,
      ],
      [`/api/v1/group/flags/${FLAG_ID}`, undefined],
      [
        `/api/v1/group/flags/${FLAG_ID}`,
        { method: 'PATCH', body: { ownerId: null, status: 'resolved', note: 'Checked.' } },
      ],
      [`/api/v1/group/flags/${FLAG_ID}/remind`, { method: 'POST' }],
      ['/api/v1/settings/template', undefined],
      ['/api/v1/settings/template', { method: 'PUT', body: { version: 1, fields: [] } }],
      ['/api/v1/settings/anomaly-rules', undefined],
      [
        '/api/v1/settings/anomaly-rules/ANM-03',
        { method: 'PUT', body: { threshold: '25', enabled: true } },
      ],
      ['/api/v1/group/overview?period=2026-09', undefined],
      [`/api/v1/group/overview?period=2026-09&entityId=${SUB_A}&department=Finance`, undefined],
      ['/api/v1/group/compensation?period=2026-09', undefined],
      [`/api/v1/group/compensation?period=2026-09&entityId=${SUB_A}&department=Sales`, undefined],
      ['/api/v1/group/executive?period=2026-09', undefined],
    ]);
  });

  it('downloads files, extracts with the report timeout', async () => {
    await downloadTemplate('ar');
    await downloadUploadIssues(UPLOAD_ID, 'en');
    await downloadUploadFile(UPLOAD_ID);
    await downloadExtract({ format: 'csv', period: '2026-09', allVersions: false, locale: 'en' });
    await downloadExtract({
      format: 'palmhr',
      period: '2026-09',
      entityId: SUB_A,
      allVersions: true,
      locale: 'en',
    });
    await downloadGroupReport({ code: 'rp-06', period: '2026-Q3', format: 'pdf', locale: 'ar' });
    await downloadGroupReport({
      code: 'rp-03',
      period: '2026-09',
      format: 'xlsx',
      entityId: SUB_A,
      locale: 'en',
    });
    expect(() =>
      downloadGroupReport({
        code: 'rp-03',
        period: '2026-09',
        format: 'xlsx',
        entityId: '../x',
        locale: 'en',
      }),
    ).toThrow();
    expect(vi.mocked(downloadFromApi).mock.calls).toEqual([
      ['/api/v1/group/template/file?locale=ar'],
      [`/api/v1/group/uploads/${UPLOAD_ID}/issues?locale=en`],
      [`/api/v1/group/uploads/${UPLOAD_ID}/file`],
      [
        '/api/v1/group/extract?format=csv&period=2026-09&allVersions=false&locale=en',
        REPORT_TIMEOUT_MS,
      ],
      [
        `/api/v1/group/extract?format=palmhr&period=2026-09&entityId=${SUB_A}&allVersions=true&locale=en`,
        REPORT_TIMEOUT_MS,
      ],
      ['/api/v1/reports/rp-06?period=2026-Q3&format=pdf&locale=ar', REPORT_TIMEOUT_MS],
      [
        `/api/v1/reports/rp-03?period=2026-09&format=xlsx&entityId=${SUB_A}&locale=en`,
        REPORT_TIMEOUT_MS,
      ],
    ]);
  });

  it('refuses malformed IDs and rule codes before calling', () => {
    expect(() => getUpload('../x')).toThrow();
    expect(() => updateAnomalyRule('ANM-3; DROP', { threshold: null, enabled: true })).toThrow();
  });
});

describe('required', () => {
  it('returns data, or leaves for "Session ended", "Not found" or the error page', () => {
    expect(required({ kind: 'ok', data: 1 })).toBe(1);
    expect(() => required({ kind: 'unauthenticated' })).toThrow('NEXT_REDIRECT /session-ended');
    expect(() => required({ kind: 'error', status: 404, code: 'NOT_FOUND', details: [] })).toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(() => required({ kind: 'error', status: 403, code: 'FORBIDDEN', details: [] })).toThrow(
      'Group data API unavailable',
    );
    expect(() => required({ kind: 'unavailable' })).toThrow('Group data API unavailable');
  });
});
