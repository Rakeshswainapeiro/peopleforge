import { PeriodSchema, type AgeBand, type IncrementBucket } from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import { z } from 'zod';
import type { MessageKey } from '@/i18n/translator';
import { currentPeriod, periodBefore, type SearchParams } from './group-view';

/**
 * Group dashboards (DASH-D5 overview, D6 compensation, D8 executive): URL state and wording.
 * Figures arrive as totals; this only formats them for the reader.
 */

export const OVERVIEW_PATH = '/group/overview';
export const COMPENSATION_PATH = '/group/compensation';
export const EXECUTIVE_PATH = '/executive';

const Id = z.uuid();
const Department = z.string().trim().min(1).max(80);

export interface DashboardState {
  period: string;
  entity?: string | undefined;
  department?: string | undefined;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Defaults to last month: data is uploaded after a month ends. */
export function dashboardState(params: SearchParams, now: Date): DashboardState {
  return {
    period:
      PeriodSchema.safeParse(first(params.period)).data ?? periodBefore(currentPeriod(now), 1),
    entity: Id.safeParse(first(params.entity)).data,
    department: Department.safeParse(first(params.department)).data,
  };
}

/** "+2.7%", "−1.5%", "0%"; "—" without a value. */
export function signedPercent(value: string | null, locale: Locale): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'percent',
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
  }).format(value as `${number}`);
}

/** "47.4%"; "—" without a value. */
export function plainPercent(value: string | null, locale: Locale): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'percent',
    maximumFractionDigits: 1,
  }).format(value as `${number}`);
}

/** Short month for chart labels: "Sep 26". */
export function shortMonth(period: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${period}-01T00:00:00Z`));
}

/** Compact amounts for chart labels: "1.2M", "189K". */
export function compact(value: string, locale: Locale): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value as `${number}`,
  );
}

/** Joiners and leavers: "+2 / −1"; a zero has no sign ("0 / 0"). */
export function movement(joiners: number, leavers: number, locale: Locale): string {
  const number = new Intl.NumberFormat(locale);
  const signed = (value: number, sign: string) =>
    value === 0 ? number.format(0) : `${sign}${number.format(value)}`;
  return `${signed(joiners, '+')} / ${signed(leavers, '−')}`;
}

export const ageBandKey = (band: AgeBand): MessageKey => `groupDashboards.ageBands.${band}`;
export const bucketKey = (bucket: IncrementBucket): MessageKey =>
  `groupDashboards.buckets.${bucket}`;
