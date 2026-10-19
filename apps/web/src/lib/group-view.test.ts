import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import { flag, SUB_A, upload } from '@/test-support/group';
import {
  activityText,
  comparisonItems,
  currentPeriod,
  employeesHref,
  employeesState,
  employmentStatusKey,
  entityChoices,
  extractState,
  fieldName,
  flagBadge,
  flagDetails,
  flagFill,
  flagSubject,
  flagHref,
  flagsHref,
  flagsState,
  formatPeriod,
  groupErrorFor,
  issueRow,
  periodBefore,
  periodOptions,
  ruleDescription,
  ruleName,
  uploadBadge,
  uploadFileHref,
  uploadIssuesHref,
  uploadRows,
  uploadsHref,
  uploadsState,
  employeeHistoryHref,
} from './group-view';

// Group data pages (R2-01 … R2-14): URL state, links and wording.

const t = createTranslator('en');
// 19 Oct 2026, 21:30 UTC is already 20 Oct in Dubai; 31 Oct 21:00 UTC is 1 Nov there.
const NOW = new Date('2026-10-19T21:30:00Z');

describe('months', () => {
  it('uses the business time zone for the current month', () => {
    expect(currentPeriod(NOW)).toBe('2026-10');
    expect(currentPeriod(new Date('2026-10-31T21:00:00Z'))).toBe('2026-11');
  });

  it('steps back across years and words months', () => {
    expect(periodBefore('2026-01', 1)).toBe('2025-12');
    expect(formatPeriod('2026-09', 'en')).toBe('September 2026');
    expect(formatPeriod('2026-09', 'ar')).not.toBe('September 2026');
    expect(periodOptions(NOW, 'en', 3)).toEqual([
      { value: '2026-10', label: 'October 2026' },
      { value: '2026-09', label: 'September 2026' },
      { value: '2026-08', label: 'August 2026' },
    ]);
    expect(periodOptions(NOW, 'en')).toHaveLength(24);
  });

  it('offers "All subsidiaries" only when there are several', () => {
    const a = { id: SUB_A, code: 'SUB-A' };
    expect(entityChoices([a], t)).toEqual([{ value: SUB_A, label: 'SUB-A' }]);
    expect(entityChoices([a, { id: 'b', code: 'SUB-B' }], t)[0]).toEqual({
      value: '',
      label: 'All subsidiaries',
    });
  });
});

describe('uploads', () => {
  it('reads and writes its URL state, ignoring what it does not know', () => {
    expect(uploadsState({ entity: SUB_A, period: '2026-09', page: '2' })).toEqual({
      entity: SUB_A,
      period: '2026-09',
      page: 2,
    });
    expect(uploadsState({ entity: ['x'], period: '2026-13', page: '0' })).toEqual({
      entity: undefined,
      period: undefined,
      page: 1,
    });
    const state = { entity: SUB_A, period: '2026-09', page: 3 };
    expect(uploadsHref(state)).toBe(`/group/uploads?entity=${SUB_A}&period=2026-09`);
    expect(uploadsHref(state, { page: 2 })).toBe(
      `/group/uploads?entity=${SUB_A}&period=2026-09&page=2`,
    );
    expect(uploadsHref({ page: 1 })).toBe('/group/uploads');
    expect(uploadIssuesHref('u')).toBe('/group/uploads/u/issues');
    expect(uploadFileHref('u')).toBe('/group/uploads/u/file');
    expect(employeeHistoryHref('r')).toBe('/group/employees/r');
    expect(flagHref('f')).toBe('/group/quality/flags/f');
  });

  it('words statuses, versions, problems and who uploaded', () => {
    expect(uploadBadge('accepted', t)).toEqual({ tone: 'success', label: 'In use' });
    expect(uploadBadge('superseded', t)).toEqual({ tone: 'outline', label: 'Replaced' });
    expect(uploadBadge('rejected', t)).toEqual({ tone: 'danger', label: 'Rejected' });
    const rows = uploadRows(
      [upload(), upload({ id: 'r', status: 'rejected', version: null, errors: 0, warnings: 0 })],
      'en',
      t,
      () => '5 Oct 2026',
    );
    expect(rows[0]).toMatchObject({
      reference: 'UP-0007',
      period: 'September 2026',
      version: 'Version 2',
      problems: '0 errors · 1 warnings',
      by: 'Priya Nair · 5 Oct 2026',
      href: '/group/uploads/66666666-6666-4666-8666-666666666661',
    });
    expect(rows[1]).toMatchObject({ version: '—', problems: '—' });
  });

  it('says where each problem is, by column name, never its value', () => {
    const labels = new Map([['grade', 'Grade']]);
    expect(
      issueRow(
        { row: null, field: 'grade', code: 'missing_column', severity: 'error' },
        labels,
        'en',
        t,
      ),
    ).toEqual({
      where: 'Whole file',
      column: 'Grade',
      problem: 'A required column is missing.',
      severity: { tone: 'danger', label: 'Error' },
    });
    expect(
      issueRow(
        { row: 1, field: null, code: 'unknown_column', severity: 'warning' },
        labels,
        'en',
        t,
      ),
    ).toMatchObject({
      where: 'Header row',
      column: '—',
      severity: { tone: 'warning' },
    });
    expect(
      issueRow(
        { row: 1204, field: 'x_field', code: 'required', severity: 'error' },
        labels,
        'en',
        t,
      ),
    ).toMatchObject({
      where: 'Row 1,204',
      column: 'x_field',
    });
  });

  it('lists the comparison with the previous month', () => {
    const items = comparisonItems(
      {
        previousPeriod: '2026-08',
        headcount: 412,
        previousHeadcount: 405,
        payrollChangePercent: '-1.5',
        newRecords: 9,
        left: 2,
        missing: 1,
        changed: 94,
        warnings: [],
      },
      'en',
      t,
    );
    expect(items.map((item) => item.value)).toEqual(['405 → 412', '-1.5%', '9', '2', '1', '94']);
    const first = comparisonItems(
      {
        previousPeriod: null,
        headcount: 10,
        previousHeadcount: null,
        payrollChangePercent: null,
        newRecords: 10,
        left: 0,
        missing: 0,
        changed: 0,
        warnings: [],
      },
      'en',
      t,
    );
    expect(first.slice(0, 2).map((item) => item.value)).toEqual(['10', '—']);
  });
});

describe('employee data', () => {
  it('defaults to last month and keeps filters in the URL', () => {
    expect(employeesState({}, NOW)).toEqual({
      period: '2026-09',
      entity: undefined,
      department: undefined,
      search: undefined,
      page: 1,
    });
    const state = employeesState(
      { period: '2026-08', entity: SUB_A, department: 'Finance', q: ' aisha ', page: '4' },
      NOW,
    );
    expect(state).toMatchObject({
      period: '2026-08',
      department: 'Finance',
      search: 'aisha',
      page: 4,
    });
    expect(employeesHref(state)).toBe(
      `/group/employees?period=2026-08&entity=${SUB_A}&department=Finance&q=aisha`,
    );
    expect(employeesHref(state, { page: 2 })).toContain('&page=2');
  });

  it('names fields and statuses', () => {
    expect(fieldName('grade', new Map([['grade', 'Grade']]))).toBe('Grade');
    expect(fieldName('project', new Map())).toBe('project');
    expect(['left', 'on_leave', 'active', 'other'].map(employmentStatusKey)).toEqual([
      'group.employmentStatus.left',
      'group.employmentStatus.on_leave',
      'group.employmentStatus.active',
      'group.employmentStatus.active',
    ]);
  });
});

describe('data quality', () => {
  it('defaults to last month, "all" for every month', () => {
    expect(flagsState({}, NOW)).toEqual({
      period: '2026-09',
      entity: undefined,
      status: undefined,
      rule: undefined,
      page: 1,
    });
    const all = flagsState(
      { period: 'all', status: 'open', rule: 'ANM-03', page: '2', entity: SUB_A },
      NOW,
    );
    expect(all).toMatchObject({ period: undefined, status: 'open', rule: 'ANM-03', page: 2 });
    expect(flagsHref(all)).toBe(
      `/group/quality?period=all&entity=${SUB_A}&status=open&rule=ANM-03`,
    );
    expect(flagsHref(all, { period: '2026-09', page: 3 })).toBe(
      `/group/quality?period=2026-09&entity=${SUB_A}&status=open&rule=ANM-03&page=3`,
    );
    expect(flagsState({ status: 'gone', rule: 'X' }, NOW)).toMatchObject({
      status: undefined,
      rule: undefined,
    });
  });

  it('words statuses, rules and thresholds', () => {
    expect(flagBadge('open', t)).toEqual({ tone: 'danger', label: 'Open' });
    expect(flagBadge('in_progress', t).tone).toBe('warning');
    expect(flagBadge('resolved', t).tone).toBe('success');
    expect(ruleName('salary_change', t)).toBe('Salary changed sharply');
    expect(ruleDescription('salary_change', '20', t)).toBe(
      'Gross salary changed by more than 20% from last month.',
    );
    expect(ruleDescription('salary_change', null, t)).toBe('Gross salary changed from last month.');
    expect(ruleDescription('grade_change', '5', t)).toBe('The grade differs from last month.');
  });

  it('lists a flag values in a fixed order, formatted, unknown keys left out', () => {
    expect(
      flagDetails(
        flag({
          detail: {
            current: '14700.00',
            previous: '14200.00',
            change: '3.5',
            grade: 'G5',
            previousPeriod: '2026-08',
            months: '12',
            text: 'n/a',
            min: 'abc',
          },
        }),
        'en',
        t,
      ),
    ).toEqual([
      { id: 'previous', label: 'Last month', value: '14,200' },
      { id: 'current', label: 'This month', value: '14,700' },
      { id: 'change', label: 'Change', value: '3.5%' },
      { id: 'min', label: 'Band minimum', value: 'abc' },
      { id: 'grade', label: 'Grade', value: 'G5' },
      { id: 'months', label: 'Months unchanged', value: '12' },
      { id: 'previousPeriod', label: 'Last seen in', value: 'August 2026' },
    ]);
    expect(flagDetails(flag({ detail: {} }), 'en', t)).toEqual([]);
  });

  it('names who a flag is about, and colours statuses', () => {
    expect(flagSubject({ employeeName: 'Hassan Ali', employeeNumber: 'EMP-3318' }, t)).toBe(
      'Hassan Ali · EMP-3318',
    );
    expect(flagSubject({ employeeName: 'Hassan Ali', employeeNumber: null }, t)).toBe('Hassan Ali');
    expect(flagSubject({ employeeName: null, employeeNumber: null }, t)).toBe('Whole subsidiary');
    expect(['open', 'in_progress', 'resolved'].map((status) => flagFill(status as 'open'))).toEqual(
      ['fill-danger-600', 'fill-warning-700', 'fill-success-600'],
    );
  });

  it('words activity entries', () => {
    expect(activityText({ action: 'anomaly_flag.raised', details: {} }, t)).toBe(
      'Flag raised by the anomaly rules',
    );
    expect(activityText({ action: 'anomaly_flag.reminded', details: { owner: 'Priya' } }, t)).toBe(
      'Reminder sent to Priya',
    );
    expect(activityText({ action: 'anomaly_flag.reminded', details: {} }, t)).toBe(
      'Reminder sent to ',
    );
    expect(
      activityText(
        { action: 'anomaly_flag.updated', details: { to: 'resolved', owner: 'Priya' } },
        t,
      ),
    ).toBe('Status Resolved · owner Priya');
    expect(activityText({ action: 'anomaly_flag.updated', details: { to: 'resolved' } }, t)).toBe(
      'Status Resolved · owner ',
    );
    expect(activityText({ action: 'anomaly_flag.updated', details: { to: 'x' } }, t)).toBe(
      'Changed',
    );
    expect(activityText({ action: 'other.thing', details: {} }, t)).toBe('Changed');
  });
});

describe('extract', () => {
  it('defaults to last month in Excel', () => {
    expect(extractState({}, NOW)).toEqual({
      period: '2026-09',
      entity: undefined,
      allVersions: false,
      format: 'xlsx',
    });
    expect(
      extractState(
        { period: '2026-07', entity: SUB_A, allVersions: 'true', format: 'palmhr' },
        NOW,
      ),
    ).toEqual({ period: '2026-07', entity: SUB_A, allVersions: true, format: 'palmhr' });
  });
});

describe('groupErrorFor', () => {
  it.each([
    [403, [], 'group.errors.forbidden'],
    [413, [], 'group.errors.tooLarge'],
    [400, [{ path: 'file', code: 'too_large' }], 'group.errors.tooLarge'],
    [400, [{ path: 'file', code: 'media_type' }], 'group.errors.mediaType'],
    [400, [{ path: 'file', code: 'infected' }], 'group.errors.infected'],
    [409, [{ path: 'file', code: 'duplicate_file' }], 'group.errors.duplicateFile'],
    [400, [{ path: 'period', code: 'future' }], 'group.errors.future'],
    [409, [{ path: 'version', code: 'stale' }], 'group.errors.stale'],
    [409, [{ path: 'status', code: 'superseded' }], 'group.errors.superseded'],
    [400, [{ path: 'note', code: 'note_required' }], 'group.errors.noteRequired'],
    [400, [{ path: 'x', code: 'other' }], 'group.errors.invalid'],
    [404, [], 'group.errors.generic'],
  ])('maps %s %j to %s', (status, details, key) => {
    expect(groupErrorFor(status, details)).toBe(key);
  });
});
