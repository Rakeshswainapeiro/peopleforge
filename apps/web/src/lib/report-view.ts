import {
  GROUP_REPORTS,
  GroupReportCodeSchema,
  groupReportSpec,
  reportPeriodSchema,
  type DashboardFilter,
  type GroupReportCode,
  type Permission,
  type ReportCadence,
  type ReportFormat,
} from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type { Translate } from '@/i18n/translator';
import { ALL_PERIODS, dashboardState, type SearchParams } from './dashboard-view';
import { currentPeriod, periodOptions, type Option } from './group-view';

/**
 * The Reports page (R1-14): RP-01 downloads carry the page's filters in the URL, with the period
 * resolved (a cycle ID or "all"), so the file always matches the preview on screen.
 */

export const REPORTS_PATH = '/reports';
export const RP01_PATH = '/reports/increment-requests';

/** RP-01 lists people and their increments: request access and compensation access. */
export function canReadIncrementReport(permissions: readonly Permission[]): boolean {
  return (
    permissions.includes('increment_request:read') &&
    permissions.includes('employee_data:read_compensation')
  );
}

/** A download link for RP-01 with these filters. */
export function reportHref(filter: DashboardFilter, format: ReportFormat): string {
  const query = new URLSearchParams({ format, cycle: filter.cycleId ?? ALL_PERIODS });
  if (filter.entityId !== undefined) query.set('entity', filter.entityId);
  if (filter.status !== undefined) query.set('status', filter.status);
  if (filter.search !== undefined) query.set('q', filter.search);
  return `${RP01_PATH}?${query.toString()}`;
}

/** Reads a download link back; null for an unknown format. */
export function reportQuery(
  params: SearchParams,
): { format: ReportFormat; filter: DashboardFilter } | null {
  const format = params.format;
  if (format !== 'xlsx' && format !== 'pdf') return null;
  const state = dashboardState(params);
  return {
    format,
    filter: {
      cycleId: state.cycle === ALL_PERIODS ? undefined : state.cycle,
      entityId: state.entity,
      status: state.status,
      search: state.search,
    },
  };
}

// ---- Group reports (R2-06, R2-07) ----

/** The permission each group report needs; the API checks the same. */
export function groupReportPermission(code: GroupReportCode): Permission {
  switch (code) {
    case 'rp-03':
    case 'rp-05':
      return 'employee_data:read';
    case 'rp-04':
      return 'employee_data:read_compensation';
    case 'rp-06':
    case 'rp-07':
      return 'report:read_executive';
  }
}

/** The group reports this reader may download, in order. */
export function groupReportsFor(permissions: readonly Permission[]): GroupReportCode[] {
  return GROUP_REPORTS.filter((code) => permissions.includes(groupReportPermission(code)));
}

export const groupReportHref = (code: GroupReportCode): string => `${REPORTS_PATH}/group/${code}`;

/** How many periods each cadence offers. */
const QUARTERS = 8;
const YEARS = 3;

/**
 * The periods a report can be run for, newest first. Months start with the current one (as on
 * the dashboards); quarters and years with the last one that has ended, since the reviews look
 * back over a whole period.
 */
export function reportPeriodOptions(
  cadence: ReportCadence,
  now: Date,
  locale: Locale,
  t: Translate,
): Option[] {
  if (cadence === 'month') return periodOptions(now, locale);
  const [year, month] = currentPeriod(now).split('-').map(Number) as [number, number];
  const digits = new Intl.NumberFormat(locale, { useGrouping: false });
  if (cadence === 'year') {
    return Array.from({ length: YEARS }, (_, index) => {
      const value = year - 1 - index;
      return { value: String(value), label: digits.format(value) };
    });
  }
  // Quarters counted from year 0: the current one is year * 4 + its index; start one before.
  const current = year * 4 + Math.floor((month - 1) / 3);
  return Array.from({ length: QUARTERS }, (_, index) => {
    const quarter = current - 1 - index;
    const value = `${String(Math.floor(quarter / 4))}-Q${String((quarter % 4) + 1)}`;
    return {
      value,
      label: t('reports.quarter', {
        quarter: digits.format((quarter % 4) + 1),
        year: digits.format(Math.floor(quarter / 4)),
      }),
    };
  });
}

/** A group report download read back from its form; null for anything the report doesn't take. */
export function groupReportQuery(
  code: string,
  params: SearchParams,
): {
  code: GroupReportCode;
  period: string;
  format: ReportFormat;
  entityId?: string | undefined;
} | null {
  const parsed = GroupReportCodeSchema.safeParse(code);
  if (!parsed.success) return null;
  const spec = groupReportSpec(parsed.data);
  const { format, entity } = params;
  const period = reportPeriodSchema(spec.cadence).safeParse(params.period);
  if (!period.success) return null;
  if (format !== 'xlsx' && format !== 'pdf') return null;
  if (!spec.formats.includes(format)) return null;
  // "All subsidiaries" sends an empty value.
  const chosen = entity === '' ? undefined : entity;
  const entityId = z.uuid().safeParse(chosen);
  if (chosen !== undefined && !entityId.success) return null;
  // The quarterly and annual reviews are group-wide.
  if (spec.cadence !== 'month' && chosen !== undefined) return null;
  return { code: parsed.data, period: period.data, format, entityId: entityId.data };
}
