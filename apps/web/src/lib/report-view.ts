import type { DashboardFilter, Permission, ReportFormat } from '@peopleforge/contracts';
import { ALL_PERIODS, dashboardState, type SearchParams } from './dashboard-view';

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
