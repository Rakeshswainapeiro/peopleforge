import { Decimal } from 'decimal.js';
import {
  AGE_BAND_KEYS,
  INCREMENT_BUCKETS,
  type Compensation,
  type ExecutiveView,
  type GroupOverview,
  type IncrementBucket,
} from '@peopleforge/contracts';
import type { GradeBandRecord, SummaryRow } from '@peopleforge/db';
import { monthsBefore } from './compare.js';
import { DepartmentMetricsSchema, type DepartmentMetrics } from './summary.js';

/**
 * The group dashboards (R2-05, R2-07; DASH-D5, D6, D8) as pure functions of the stored
 * per-department figures (ADR-015), so every total is tested with worked examples. Amounts in
 * different currencies are never added together; percentages are rounded only for display.
 */

export interface EntityRef {
  id: string;
  code: string;
}

/** A stored row with its figures checked (a malformed row is left out, never guessed). */
export interface Figures {
  entity: EntityRef;
  period: string;
  department: string;
  metrics: DepartmentMetrics;
}

export function parseRows(rows: readonly SummaryRow[]): Figures[] {
  return rows.flatMap((row) => {
    const metrics = DepartmentMetricsSchema.safeParse(row.metrics);
    return metrics.success
      ? [
          {
            entity: { id: row.entityId, code: row.entityCode },
            period: row.period,
            department: row.department,
            metrics: metrics.data,
          },
        ]
      : [];
  });
}

/** The 12 months up to `period`, oldest first. */
export function trendMonths(period: string): string[] {
  return Array.from({ length: 12 }, (_, index) => monthsBefore(period, 11 - index));
}

/** `part` of `whole` in percent, one decimal; null when `whole` is zero. */
export function percentOf(part: Decimal.Value, whole: Decimal.Value): string | null {
  const base = new Decimal(whole);
  return base.isZero() ? null : new Decimal(part).dividedBy(base).times(100).toFixed(1);
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** Adds `by` to a running count. */
function count<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

interface Totals {
  headcount: number;
  joiners: number;
  leavers: number;
  female: number;
  male: number;
  other: number;
  ageBands: Map<string, number>;
  grades: Map<string, number>;
  /** currency → { headcount, payroll } */
  pay: Map<string, { headcount: number; payroll: Decimal }>;
  /** `${currency}|${grade}` → { currency, grade, headcount, payroll } */
  payByGrade: Map<string, { currency: string; grade: string; headcount: number; payroll: Decimal }>;
}

function totals(rows: readonly Figures[]): Totals {
  const result: Totals = {
    headcount: 0,
    joiners: 0,
    leavers: 0,
    female: 0,
    male: 0,
    other: 0,
    ageBands: new Map(),
    grades: new Map(),
    pay: new Map(),
    payByGrade: new Map(),
  };
  for (const { metrics } of rows) {
    result.headcount += metrics.headcount;
    result.joiners += metrics.joiners;
    result.leavers += metrics.leavers;
    result.female += metrics.female;
    result.male += metrics.male;
    result.other += metrics.otherGender;
    for (const [band, value] of Object.entries(metrics.ageBands)) {
      count(result.ageBands, band, value);
    }
    for (const cell of metrics.pay) {
      count(result.grades, cell.grade, cell.headcount);
      const currency = result.pay.get(cell.currency) ?? { headcount: 0, payroll: new Decimal(0) };
      result.pay.set(cell.currency, {
        headcount: currency.headcount + cell.headcount,
        payroll: currency.payroll.plus(cell.payroll),
      });
      const key = `${cell.currency}|${cell.grade}`;
      const grade = result.payByGrade.get(key) ?? {
        currency: cell.currency,
        grade: cell.grade,
        headcount: 0,
        payroll: new Decimal(0),
      };
      result.payByGrade.set(key, {
        ...grade,
        headcount: grade.headcount + cell.headcount,
        payroll: grade.payroll.plus(cell.payroll),
      });
    }
  }
  return result;
}

const byText = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/** Leavers over the average headcount of this and last month, in percent. */
function turnover(leavers: number, headcount: number, previous: number | null): string | null {
  const average = previous === null ? headcount : (headcount + previous) / 2;
  return percentOf(leavers, average);
}

export interface DashboardInput {
  period: string;
  rows: readonly Figures[];
  /** Subsidiaries in the caller's scope (the filter, if any, applied). */
  entities: readonly EntityRef[];
  department?: string | undefined;
}

function inMonth(rows: readonly Figures[], period: string, department?: string): Figures[] {
  return rows.filter(
    (row) => row.period === period && (department === undefined || row.department === department),
  );
}

function headcountTrend(rows: readonly Figures[], period: string, department?: string) {
  return trendMonths(period).map((month) => {
    const figures = inMonth(rows, month, department);
    return {
      period: month,
      headcount: figures.length === 0 ? null : totals(figures).headcount,
    };
  });
}

/** DASH-D5 Group overview. */
export function groupOverview(input: DashboardInput): GroupOverview {
  const previousPeriod = monthsBefore(input.period, 1);
  const current = inMonth(input.rows, input.period, input.department);
  const previous = inMonth(input.rows, previousPeriod, input.department);
  const now = totals(current);
  const before = previous.length === 0 ? null : totals(previous).headcount;
  const byEntity = input.entities
    .map((entity) => {
      const figures = totals(current.filter((row) => row.entity.id === entity.id));
      return {
        entity,
        headcount: figures.headcount,
        joiners: figures.joiners,
        leavers: figures.leavers,
        present: current.some((row) => row.entity.id === entity.id),
      };
    })
    .filter((entry) => entry.present)
    .map(({ present: _present, ...entry }) => entry);
  const departments = new Map<string, number>();
  for (const row of current) {
    count(departments, row.department, row.metrics.headcount);
  }
  return {
    period: input.period,
    previousPeriod,
    entities: input.entities.length,
    entitiesWithData: byEntity.length,
    headcount: now.headcount,
    previousHeadcount: before,
    joiners: now.joiners,
    leavers: now.leavers,
    turnoverPercent: turnover(now.leavers, now.headcount, before),
    female: now.female,
    femaleSharePercent: percentOf(now.female, now.headcount),
    byEntity,
    byDepartment: [...departments]
      .sort(([a], [b]) => byText(a, b))
      .map(([department, headcount]) => ({ department, headcount })),
    gender: { female: now.female, male: now.male, other: now.other },
    ageBands: AGE_BAND_KEYS.map((band) => ({ band, count: now.ageBands.get(band) ?? 0 })),
    grades: [...now.grades]
      .sort(([a], [b]) => byText(a, b))
      .map(([grade, headcount]) => ({ grade, headcount })),
    trend: headcountTrend(input.rows, input.period, input.department),
    departments: [
      ...new Set(
        input.rows.filter((row) => row.period === input.period).map((row) => row.department),
      ),
    ].sort(byText),
  };
}

/** An increment approved in the Increment Portal, as D6 needs it. */
export interface ApprovedIncrementFigures {
  entity: EntityRef;
  currency: string;
  /** Monthly increase and its percentage (R1 money rules). */
  increase: string;
  percent: string;
}

export function incrementBucket(percent: Decimal.Value): IncrementBucket {
  const value = new Decimal(percent);
  if (value.lessThan(3)) return 'under_3';
  if (value.lessThan(5)) return '3_5';
  if (value.lessThan(8)) return '5_8';
  if (value.lessThan(10)) return '8_10';
  return '10_plus';
}

export interface CompensationInput extends DashboardInput {
  bands: readonly GradeBandRecord[];
  increments: readonly ApprovedIncrementFigures[];
}

/** DASH-D6 Compensation trends. */
export function compensation(input: CompensationInput): Compensation {
  const previousPeriod = monthsBefore(input.period, 1);
  const now = totals(inMonth(input.rows, input.period, input.department));
  const previousRows = inMonth(input.rows, previousPeriod, input.department);
  const before = previousRows.length === 0 ? null : totals(previousRows);
  const payroll = [...now.pay]
    .sort(([a], [b]) => byText(a, b))
    .map(([currency, figures]) => {
      const previous = before?.pay.get(currency);
      return {
        currency,
        amount: figures.payroll.toFixed(2),
        previousAmount: previous === undefined ? null : previous.payroll.toFixed(2),
        changePercent:
          previous === undefined
            ? null
            : percentOf(figures.payroll.minus(previous.payroll), previous.payroll),
        headcount: figures.headcount,
        // Every stored cell has at least one employee (DepartmentMetricsSchema).
        average: figures.payroll.dividedBy(figures.headcount).toFixed(2),
      };
    });
  const bands = new Map(input.bands.map((band) => [`${band.currency}|${band.grade}`, band]));
  const grades = [...now.payByGrade.values()]
    .sort((a, b) => byText(a.currency, b.currency) || byText(a.grade, b.grade))
    .map((cell) => {
      const band = bands.get(`${cell.currency}|${cell.grade}`);
      return {
        grade: cell.grade,
        currency: cell.currency,
        headcount: cell.headcount,
        average: cell.payroll.dividedBy(cell.headcount).toFixed(2),
        band: band === undefined ? null : { min: band.minSalary, max: band.maxSalary },
      };
    });
  const trend = trendMonths(input.period).map((month) => {
    const figures = totals(inMonth(input.rows, month, input.department));
    return {
      period: month,
      payroll: Object.fromEntries(
        [...figures.pay].map(([currency, value]) => [currency, value.payroll.toFixed(2)]),
      ),
    };
  });
  const buckets = new Map<IncrementBucket, number>();
  const impact = new Map<
    string,
    { entity: EntityRef; currency: string; employees: number; monthly: Decimal }
  >();
  for (const increment of input.increments) {
    count(buckets, incrementBucket(increment.percent));
    const key = `${increment.entity.id}|${increment.currency}`;
    const entry = impact.get(key) ?? {
      entity: increment.entity,
      currency: increment.currency,
      employees: 0,
      monthly: new Decimal(0),
    };
    impact.set(key, {
      ...entry,
      employees: entry.employees + 1,
      monthly: entry.monthly.plus(increment.increase),
    });
  }
  const percents = input.increments.map((increment) => new Decimal(increment.percent));
  return {
    period: input.period,
    previousPeriod,
    payroll,
    trend,
    grades,
    increments: {
      approved: input.increments.length,
      averagePercent:
        percents.length === 0
          ? null
          : percents
              .reduce((total, value) => total.plus(value), new Decimal(0))
              .dividedBy(percents.length)
              .toFixed(1),
      distribution: INCREMENT_BUCKETS.map((bucket) => ({
        bucket,
        count: buckets.get(bucket) ?? 0,
      })),
      costImpact: [...impact.values()]
        .sort((a, b) => byText(a.entity.code, b.entity.code) || byText(a.currency, b.currency))
        .map((entry) => ({
          entity: entry.entity,
          currency: entry.currency,
          employees: entry.employees,
          monthlyIncrease: entry.monthly.toFixed(2),
          annualIncrease: entry.monthly.times(12).toFixed(2),
        })),
    },
    departments: [
      ...new Set(
        input.rows.filter((row) => row.period === input.period).map((row) => row.department),
      ),
    ].sort(byText),
  };
}

export interface ExecutiveInput extends DashboardInput {
  /** Open (and in-progress) flags per subsidiary for the month. */
  openFlags: ReadonlyMap<string, number>;
}

/** DASH-D8 Executive / IHC view: group totals per subsidiary, no names or individual pay. */
export function executiveView(input: ExecutiveInput): ExecutiveView {
  const overview = groupOverview({ ...input, department: undefined });
  const current = inMonth(input.rows, input.period);
  const previous = inMonth(input.rows, overview.previousPeriod);
  const now = totals(current);
  const before = totals(previous);
  return {
    period: overview.period,
    previousPeriod: overview.previousPeriod,
    entities: overview.entities,
    entitiesWithData: overview.entitiesWithData,
    headcount: overview.headcount,
    previousHeadcount: overview.previousHeadcount,
    joiners: overview.joiners,
    leavers: overview.leavers,
    turnoverPercent: overview.turnoverPercent,
    femaleSharePercent: overview.femaleSharePercent,
    payroll: [...now.pay]
      .sort(([a], [b]) => byText(a, b))
      .map(([currency, figures]) => {
        const last = before.pay.get(currency);
        return {
          currency,
          amount: figures.payroll.toFixed(2),
          changePercent:
            last === undefined
              ? null
              : percentOf(figures.payroll.minus(last.payroll), last.payroll),
        };
      }),
    byEntity: input.entities.map((entity) => {
      const rows = current.filter((row) => row.entity.id === entity.id);
      const figures = totals(rows);
      return {
        entity,
        headcount: figures.headcount,
        payroll: Object.fromEntries(
          [...figures.pay].map(([currency, value]) => [currency, value.payroll.toFixed(2)]),
        ),
        openFlags: input.openFlags.get(entity.id) ?? 0,
        missing: rows.length === 0,
      };
    }),
    trend: overview.trend,
    openFlags: sum([...input.openFlags.values()]),
  };
}
