import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import type { SearchParams } from './dashboard-view';
import {
  canReadIncrementReport,
  groupReportHref,
  groupReportQuery,
  groupReportsFor,
  reportHref,
  reportPeriodOptions,
  reportQuery,
} from './report-view';

const CYCLE = '00000000-0000-4000-8000-00000000c026';
const ENTITY = '00000000-0000-4000-8000-0000000e000a';

describe('report views [R1-14]', () => {
  it('needs request and compensation access for RP-01 (not the report permission alone)', () => {
    expect(
      canReadIncrementReport([
        'increment_request:read',
        'employee_data:read_compensation',
        'report:read_operational',
      ]),
    ).toBe(true);
    expect(canReadIncrementReport(['report:read_operational', 'audit:read'])).toBe(false);
    expect(canReadIncrementReport(['increment_request:read'])).toBe(false);
  });

  it('carries the filters into the download link and back, period resolved', () => {
    const href = reportHref(
      { cycleId: CYCLE, entityId: ENTITY, status: 'approved', search: 'Aisha & co' },
      'xlsx',
    );
    expect(href).toBe(
      `/reports/increment-requests?format=xlsx&cycle=${CYCLE}&entity=${ENTITY}&status=approved&q=Aisha+%26+co`,
    );
    const params = Object.fromEntries(new URL(href, 'http://portal.test').searchParams);
    expect(reportQuery(params)).toEqual({
      format: 'xlsx',
      filter: { cycleId: CYCLE, entityId: ENTITY, status: 'approved', search: 'Aisha & co' },
    });
    expect(reportHref({}, 'pdf')).toBe('/reports/increment-requests?format=pdf&cycle=all');
    expect(reportQuery({ format: 'pdf', cycle: 'all' })).toEqual({
      format: 'pdf',
      filter: { cycleId: undefined, entityId: undefined, status: undefined, search: undefined },
    });
  });

  it('refuses an unknown format', () => {
    expect(reportQuery({ format: 'csv' })).toBeNull();
    expect(reportQuery({})).toBeNull();
  });
});

describe('group report views [R2-06, R2-07]', () => {
  const NOW = new Date('2026-10-21T08:00:00Z');
  const t = createTranslator('en');

  it('offers each report to the readers its data allows', () => {
    expect(
      groupReportsFor([
        'employee_data:read',
        'employee_data:read_compensation',
        'report:read_executive',
      ]),
    ).toEqual(['rp-03', 'rp-04', 'rp-05', 'rp-06', 'rp-07']);
    expect(groupReportsFor(['employee_data:read'])).toEqual(['rp-03', 'rp-05']);
    expect(groupReportsFor(['report:read_executive'])).toEqual(['rp-06', 'rp-07']);
    expect(groupReportsFor(['report:read_operational', 'audit:read'])).toEqual([]);
    expect(groupReportHref('rp-04')).toBe('/reports/group/rp-04');
  });

  it('lists months from the current one, quarters and years from the last that ended', () => {
    const months = reportPeriodOptions('month', NOW, 'en', t);
    expect(months[0]).toEqual({ value: '2026-10', label: 'October 2026' });
    expect(months).toHaveLength(24);
    const quarters = reportPeriodOptions('quarter', NOW, 'en', t);
    expect(quarters.slice(0, 4)).toEqual([
      { value: '2026-Q3', label: 'Q3 2026' },
      { value: '2026-Q2', label: 'Q2 2026' },
      { value: '2026-Q1', label: 'Q1 2026' },
      { value: '2025-Q4', label: 'Q4 2025' },
    ]);
    expect(quarters).toHaveLength(8);
    // In January the last quarter and year are the previous year's.
    const january = new Date('2027-01-05T08:00:00Z');
    expect(reportPeriodOptions('quarter', january, 'en', t)[0]?.value).toBe('2026-Q4');
    expect(reportPeriodOptions('year', january, 'en', t).map((option) => option.value)).toEqual([
      '2026',
      '2025',
      '2024',
    ]);
    // Arabic digits, no thousands separator in a year.
    expect(reportPeriodOptions('year', NOW, 'ar', createTranslator('ar'))[0]?.label).toBe(
      new Intl.NumberFormat('ar', { useGrouping: false }).format(2025),
    );
  });

  it('reads a download back, refusing anything the report does not take', () => {
    expect(
      groupReportQuery('rp-03', { period: '2026-09', format: 'xlsx', entity: ENTITY }),
    ).toEqual({ code: 'rp-03', period: '2026-09', format: 'xlsx', entityId: ENTITY });
    // "All subsidiaries" is an empty value.
    expect(groupReportQuery('rp-05', { period: '2026-09', format: 'pdf', entity: '' })).toEqual({
      code: 'rp-05',
      period: '2026-09',
      format: 'pdf',
      entityId: undefined,
    });
    expect(groupReportQuery('rp-06', { period: '2026-Q3', format: 'pdf' })).toEqual({
      code: 'rp-06',
      period: '2026-Q3',
      format: 'pdf',
      entityId: undefined,
    });
    const refused: [string, SearchParams][] = [
      ['rp-99', { period: '2026-09', format: 'pdf' }],
      ['rp-03', { period: '2026-Q3', format: 'pdf' }],
      ['rp-03', { period: ['2026-09', '2026-08'], format: 'pdf' }],
      ['rp-03', { period: '2026-09', format: 'csv' }],
      ['rp-06', { period: '2026-Q3', format: 'xlsx' }],
      ['rp-03', { period: '2026-09', format: 'pdf', entity: 'SUB-A' }],
      ['rp-07', { period: '2026', format: 'pdf', entity: ENTITY }],
    ];
    for (const [code, params] of refused) expect(groupReportQuery(code, params)).toBeNull();
  });
});
