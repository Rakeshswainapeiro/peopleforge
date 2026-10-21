import type {
  Compensation,
  ExecutiveView,
  FlagPage,
  GroupOverview,
  MoneyByCurrency,
} from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import { Decimal } from 'decimal.js';
import type { ApiTranslate } from '../../i18n.js';
import { percentOf } from '../group-data/dashboards.js';
import {
  number,
  text,
  type Cell,
  type ReportDocument,
  type ReportSection,
} from './report-document.js';

/**
 * The group HR reports' content (R2-06, R2-07), from the dashboards' figures: RP-03 Headcount &
 * demographics, RP-04 Compensation & increment summary, RP-05 Data quality & anomalies, RP-06
 * Quarterly group HR review and RP-07 Annual HR report. Pure: the service fetches, these word
 * it; the renderers lay it out. Totals only, never one person's pay; currencies never added.
 */

export interface ReportContext {
  t: ApiTranslate;
  locale: Locale;
  /** Who and when, filters: already worded. */
  meta: readonly string[];
}

const DAYS = '0.0';
const PERCENT = '0.0';
const MONEY = '#,##0.00';

/** Formatting in the reader's locale, from exact decimal strings. */
function formatters(locale: Locale, none: string) {
  const integer = new Intl.NumberFormat(locale);
  const tag = locale === 'en' ? 'en-GB' : locale;
  return {
    count: (value: number) => integer.format(value),
    percent: (value: string | null) =>
      value === null
        ? none
        : new Intl.NumberFormat(locale, {
            style: 'unit',
            unit: 'percent',
            maximumFractionDigits: 1,
          }).format(value as `${number}`),
    /** A change: "+5%", "−1.5%", "0%". */
    change: (value: string | null) =>
      value === null
        ? none
        : new Intl.NumberFormat(locale, {
            style: 'unit',
            unit: 'percent',
            signDisplay: 'exceptZero',
            maximumFractionDigits: 1,
          }).format(value as `${number}`),
    money: (value: string, currency: string) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
        minimumFractionDigits: /\.\d*[1-9]/u.test(value) ? 2 : 0,
        maximumFractionDigits: 2,
      }).format(value as `${number}`),
    month: (period: string) =>
      new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${period}-01T00:00:00Z`),
      ),
    date: (iso: string) =>
      new Intl.DateTimeFormat(tag, { day: '2-digit', month: 'short', year: 'numeric' }).format(
        new Date(iso),
      ),
  };
}

/** A count cell; a change or money cell keeps the number for Excel and the words for PDF. */
function cells(locale: Locale, none: string) {
  const f = formatters(locale, none);
  return {
    count: (value: number): Cell => number(value, f.count(value)),
    change: (value: string | null): Cell =>
      number(value === null ? null : Number(value), f.change(value)),
    money: (value: string | null, currency: string): Cell =>
      number(
        value === null ? null : Number(value),
        value === null ? none : f.money(value, currency),
      ),
    f,
  };
}

function document(
  context: ReportContext,
  code: string,
  title: string,
  period: string,
  sections: readonly ReportSection[],
  landscape = false,
): ReportDocument {
  const { t } = context;
  return {
    code,
    title,
    period,
    meta: context.meta,
    sections,
    footnote: t('groupReports.footnote'),
    summary: t('groupReports.summary'),
    page: (page, pages) => t('reports.page', { page: String(page), pages: String(pages) }),
    landscape,
  };
}

/** Headcount by month as a table section. */
function trendSection(
  context: ReportContext,
  title: string,
  sheet: string,
  trend: readonly { period: string; headcount: number | null }[],
): ReportSection {
  const { t, locale } = context;
  const none = t('groupReports.none');
  const c = cells(locale, none);
  return {
    kind: 'table',
    title,
    sheet,
    columns: [
      { header: t('groupReports.colMonth'), weight: 2 },
      { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
    ],
    rows: trend.map((point) => [
      text(c.f.month(point.period)),
      point.headcount === null ? number(null, none) : c.count(point.headcount),
    ]),
    empty: none,
  };
}

/** RP-03 Headcount & demographics for one month (DASH-D5 in a file). */
export function rp03(overview: GroupOverview, context: ReportContext): ReportDocument {
  const { t, locale } = context;
  const none = t('groupReports.none');
  const c = cells(locale, none);
  const two = (header: string) => [
    { header, weight: 2 },
    { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
  ];
  return document(context, 'RP-03', t('groupReports.rp03.title'), c.f.month(overview.period), [
    {
      kind: 'figures',
      title: t('groupReports.keyFigures'),
      items: [
        {
          label: t('groupReports.headcount'),
          value: c.f.count(overview.headcount),
          ...(overview.previousHeadcount === null
            ? {}
            : {
                hint: t('groupReports.previousHeadcount', {
                  count: c.f.count(overview.previousHeadcount),
                }),
              }),
        },
        { label: t('groupReports.joiners'), value: c.f.count(overview.joiners) },
        { label: t('groupReports.leavers'), value: c.f.count(overview.leavers) },
        {
          label: t('groupReports.turnover'),
          value: c.f.percent(overview.turnoverPercent),
          hint: t('groupReports.turnoverHint'),
        },
        {
          label: t('groupReports.femaleShare'),
          value: c.f.percent(overview.femaleSharePercent),
          hint: t('groupReports.ofHeadcount', {
            count: c.f.count(overview.female),
            total: c.f.count(overview.headcount),
          }),
        },
        {
          label: t('groupReports.subsidiariesWithData'),
          value: t('groupReports.ofHeadcount', {
            count: c.f.count(overview.entitiesWithData),
            total: c.f.count(overview.entities),
          }),
        },
      ],
    },
    {
      kind: 'table',
      title: t('groupReports.rp03.bySubsidiary'),
      sheet: t('groupReports.rp03.sheetSubsidiaries'),
      columns: [
        { header: t('groupReports.colSubsidiary'), weight: 2 },
        { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
        { header: t('groupReports.colJoiners'), weight: 1, numeric: true },
        { header: t('groupReports.colLeavers'), weight: 1, numeric: true },
      ],
      rows: overview.byEntity.map((row) => [
        text(row.entity.code),
        c.count(row.headcount),
        c.count(row.joiners),
        c.count(row.leavers),
      ]),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp03.byDepartment'),
      sheet: t('groupReports.rp03.sheetDepartments'),
      columns: two(t('groupReports.colDepartment')),
      rows: overview.byDepartment.map((row) => [text(row.department), c.count(row.headcount)]),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp03.gender'),
      sheet: t('groupReports.rp03.sheetGender'),
      columns: two(t('groupReports.colGender')),
      rows: (['female', 'male', 'other'] as const).map((key) => [
        text(t(`groupReports.genders.${key}`)),
        c.count(
          key === 'female'
            ? overview.gender.female
            : key === 'male'
              ? overview.gender.male
              : overview.gender.other,
        ),
      ]),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp03.age'),
      sheet: t('groupReports.rp03.sheetAge'),
      columns: two(t('groupReports.colAgeBand')),
      rows: overview.ageBands.map((row) => [
        text(t(`groupReports.ageBands.${row.band}`)),
        c.count(row.count),
      ]),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp03.byGrade'),
      sheet: t('groupReports.rp03.sheetGrades'),
      columns: two(t('groupReports.colGrade')),
      rows: overview.grades.map((row) => [text(row.grade), c.count(row.headcount)]),
      empty: none,
    },
    trendSection(
      context,
      t('groupReports.rp03.trend'),
      t('groupReports.rp03.sheetTrend'),
      overview.trend,
    ),
  ]);
}

/** TAT of the increment requests decided in the month (R1-11), for Sirius HR's RP-04. */
export interface MonthTat {
  decided: number;
  averageDays: string | null;
  medianDays: string | null;
}

/** RP-04 Compensation & increment summary for one month (DASH-D6, R1 decisions and TAT). */
export function rp04(
  data: Compensation,
  tat: MonthTat | null,
  context: ReportContext,
): ReportDocument {
  const { t, locale } = context;
  const none = t('groupReports.none');
  const c = cells(locale, none);
  const days = (value: string | null) =>
    number(value === null ? null : Number(value), value ?? none);
  const sections: ReportSection[] = [
    {
      kind: 'figures',
      title: t('groupReports.keyFigures'),
      items: [
        ...data.payroll.flatMap((entry) => [
          {
            label: t('groupReports.rp04.payrollTitle', { currency: entry.currency }),
            value: c.f.money(entry.amount, entry.currency),
            hint: t('groupReports.rp04.payrollHint', { change: c.f.change(entry.changePercent) }),
          },
          {
            label: t('groupReports.rp04.averageTitle', { currency: entry.currency }),
            value: c.f.money(entry.average, entry.currency),
            hint: t('groupReports.employeesCount', { count: c.f.count(entry.headcount) }),
          },
        ]),
        { label: t('groupReports.rp04.approved'), value: c.f.count(data.increments.approved) },
        {
          label: t('groupReports.rp04.averageIncrement'),
          value: c.f.percent(data.increments.averagePercent),
        },
      ],
    },
    {
      kind: 'table',
      title: t('groupReports.rp04.payroll'),
      sheet: t('groupReports.rp04.sheetPayroll'),
      columns: [
        { header: t('groupReports.colCurrency'), weight: 1 },
        { header: t('groupReports.colPayroll'), weight: 2, numeric: true, numFmt: MONEY },
        { header: t('groupReports.colPrevious'), weight: 2, numeric: true, numFmt: MONEY },
        { header: t('groupReports.colChange'), weight: 1, numeric: true, numFmt: PERCENT },
        { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
        { header: t('groupReports.colAverage'), weight: 2, numeric: true, numFmt: MONEY },
      ],
      rows: data.payroll.map((entry) => [
        text(entry.currency),
        c.money(entry.amount, entry.currency),
        c.money(entry.previousAmount, entry.currency),
        c.change(entry.changePercent),
        c.count(entry.headcount),
        c.money(entry.average, entry.currency),
      ]),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp04.byGrade'),
      sheet: t('groupReports.rp04.sheetGrades'),
      columns: [
        { header: t('groupReports.colGrade'), weight: 1 },
        { header: t('groupReports.colCurrency'), weight: 1 },
        { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
        { header: t('groupReports.colAverage'), weight: 2, numeric: true, numFmt: MONEY },
        { header: t('groupReports.colBandMin'), weight: 2, numeric: true, numFmt: MONEY },
        { header: t('groupReports.colBandMax'), weight: 2, numeric: true, numFmt: MONEY },
      ],
      rows: data.grades.map((grade) => [
        text(grade.grade),
        text(grade.currency),
        c.count(grade.headcount),
        c.money(grade.average, grade.currency),
        c.money(grade.band?.min ?? null, grade.currency),
        c.money(grade.band?.max ?? null, grade.currency),
      ]),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp04.trend'),
      sheet: t('groupReports.rp04.sheetTrend'),
      columns: [
        { header: t('groupReports.colMonth'), weight: 2 },
        { header: t('groupReports.colCurrency'), weight: 1 },
        { header: t('groupReports.colPayroll'), weight: 2, numeric: true, numFmt: MONEY },
      ],
      rows: data.trend.flatMap((point) =>
        Object.entries(point.payroll).map(([currency, amount]) => [
          text(c.f.month(point.period)),
          text(currency),
          c.money(amount, currency),
        ]),
      ),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp04.distribution'),
      sheet: t('groupReports.rp04.sheetDistribution'),
      columns: [
        { header: t('groupReports.colSize'), weight: 2 },
        { header: t('groupReports.colEmployees'), weight: 1, numeric: true },
      ],
      rows: data.increments.distribution.map((entry) => [
        text(t(`groupReports.buckets.${entry.bucket}`)),
        c.count(entry.count),
      ]),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp04.cost'),
      sheet: t('groupReports.rp04.sheetCost'),
      columns: [
        { header: t('groupReports.colSubsidiary'), weight: 1 },
        { header: t('groupReports.colCurrency'), weight: 1 },
        { header: t('groupReports.colEmployees'), weight: 1, numeric: true },
        { header: t('groupReports.colMonthly'), weight: 2, numeric: true, numFmt: MONEY },
        { header: t('groupReports.colAnnual'), weight: 2, numeric: true, numFmt: MONEY },
      ],
      rows: data.increments.costImpact.map((entry) => [
        text(entry.entity.code),
        text(entry.currency),
        c.count(entry.employees),
        c.money(entry.monthlyIncrease, entry.currency),
        c.money(entry.annualIncrease, entry.currency),
      ]),
      empty: none,
    },
  ];
  if (tat !== null) {
    sections.push({
      kind: 'table',
      title: t('groupReports.rp04.tat'),
      sheet: t('groupReports.rp04.tat').slice(0, 31),
      columns: [
        { header: t('groupReports.rp04.decided'), weight: 1, numeric: true },
        { header: t('groupReports.rp04.averageTat'), weight: 1, numeric: true, numFmt: DAYS },
        { header: t('groupReports.rp04.medianTat'), weight: 1, numeric: true, numFmt: DAYS },
      ],
      rows: [[c.count(tat.decided), days(tat.averageDays), days(tat.medianDays)]],
      empty: none,
    });
  }
  return document(context, 'RP-04', t('groupReports.rp04.title'), c.f.month(data.period), sections);
}

/** RP-05 Data quality & anomalies for one month (DASH-D7 in a file); values never shown. */
export function rp05(page: FlagPage, period: string, context: ReportContext): ReportDocument {
  const { t, locale } = context;
  const none = t('groupReports.none');
  const c = cells(locale, none);
  const status = (value: 'open' | 'in_progress' | 'resolved') =>
    t(`groupReports.rp05.statuses.${value}`);
  const sections: ReportSection[] = [
    {
      kind: 'figures',
      title: t('groupReports.keyFigures'),
      items: [
        { label: t('groupReports.rp05.open'), value: c.f.count(page.counts.open) },
        { label: t('groupReports.rp05.inProgress'), value: c.f.count(page.counts.in_progress) },
        { label: t('groupReports.rp05.resolved'), value: c.f.count(page.counts.resolved) },
        {
          label: t('groupReports.rp05.oldestOpen'),
          value: page.oldestOpenAt === null ? none : c.f.date(page.oldestOpenAt),
        },
      ],
    },
    {
      kind: 'table',
      title: t('groupReports.rp05.bySubsidiary'),
      sheet: t('groupReports.rp05.sheetSubsidiaries'),
      columns: [
        { header: t('groupReports.colSubsidiary'), weight: 2 },
        { header: t('groupReports.rp05.open'), weight: 1, numeric: true },
        { header: t('groupReports.rp05.inProgress'), weight: 1, numeric: true },
        { header: t('groupReports.rp05.resolved'), weight: 1, numeric: true },
      ],
      rows: page.byEntity.map((row) => [
        text(row.entity.code),
        c.count(row.counts.open),
        c.count(row.counts.in_progress),
        c.count(row.counts.resolved),
      ]),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp05.variations'),
      sheet: t('groupReports.rp05.sheetVariations'),
      columns: [
        { header: t('groupReports.colSubsidiary'), weight: 1.2 },
        { header: t('groupReports.rp05.colUpload'), weight: 1.2 },
        { header: t('groupReports.rp05.colVersion'), weight: 0.8, numeric: true },
        { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
        { header: t('groupReports.colPrevious'), weight: 1, numeric: true },
        { header: t('groupReports.colChange'), weight: 1, numeric: true, numFmt: PERCENT },
        { header: t('groupReports.rp05.colNew'), weight: 0.8, numeric: true },
        { header: t('groupReports.rp05.colLeft'), weight: 0.8, numeric: true },
        { header: t('groupReports.rp05.colMissing'), weight: 0.8, numeric: true },
        { header: t('groupReports.rp05.colChanged'), weight: 0.8, numeric: true },
        { header: t('groupReports.rp05.colFlags'), weight: 0.8, numeric: true },
      ],
      rows: page.variations.map((row) => {
        const comparison = row.comparison;
        const previous = comparison?.previousHeadcount ?? null;
        const blank = number(null, none);
        return [
          text(row.entity.code),
          text(row.upload.reference),
          c.count(row.upload.version),
          comparison === null ? blank : c.count(comparison.headcount),
          previous === null ? blank : c.count(previous),
          c.change(comparison?.payrollChangePercent ?? null),
          comparison === null ? blank : c.count(comparison.newRecords),
          comparison === null ? blank : c.count(comparison.left),
          comparison === null ? blank : c.count(comparison.missing),
          comparison === null ? blank : c.count(comparison.changed),
          c.count(row.flags),
        ];
      }),
      empty: none,
    },
    {
      kind: 'table',
      title: t('groupReports.rp05.flags'),
      sheet: t('groupReports.rp05.sheetFlags'),
      columns: [
        { header: t('groupReports.rp05.colFlag'), weight: 0.9 },
        { header: t('groupReports.colSubsidiary'), weight: 0.9 },
        { header: t('groupReports.rp05.colRule'), weight: 1.8 },
        { header: t('groupReports.rp05.colEmployee'), weight: 2 },
        { header: t('groupReports.rp05.colField'), weight: 1.1 },
        { header: t('groupReports.rp05.colStatus'), weight: 1 },
        { header: t('groupReports.rp05.colOwner'), weight: 1.5 },
        { header: t('groupReports.rp05.colRaised'), weight: 1 },
      ],
      rows: page.items.map((flag) => [
        text(flag.reference),
        text(flag.entity.code),
        text(`${flag.ruleCode} · ${t(`groupReports.rp05.rules.${flag.ruleKind}`)}`),
        text(
          flag.employeeNumber === null
            ? none
            : flag.employeeName === null
              ? flag.employeeNumber
              : `${flag.employeeName} · ${flag.employeeNumber}`,
        ),
        text(flag.field ?? none),
        text(status(flag.status)),
        text(flag.owner.name),
        text(c.f.date(flag.createdAt)),
      ]),
      empty: none,
    },
  ];
  const meta =
    page.total > page.items.length
      ? [...context.meta, t('groupReports.rp05.truncated', { count: c.f.count(page.items.length) })]
      : context.meta;
  return document(
    { ...context, meta },
    'RP-05',
    t('groupReports.rp05.title'),
    c.f.month(period),
    sections,
    true,
  );
}

/** Turnover over a span: leavers over the average of the headcounts at its start and end. */
export function spanTurnover(leavers: number, start: number | null, end: number): string | null {
  const average = new Decimal(start ?? end).plus(end).dividedBy(2);
  return percentOf(leavers, average);
}

/** Payroll at two period ends, per currency, with the change: never added across currencies. */
function payrollRows(
  end: MoneyByCurrency,
  start: MoneyByCurrency,
  c: ReturnType<typeof cells>,
): Cell[][] {
  const currencies = [...new Set([...Object.keys(end), ...Object.keys(start)])].sort();
  const at = (money: MoneyByCurrency, currency: string) =>
    new Map(Object.entries(money)).get(currency) ?? null;
  return currencies.map((currency) => {
    const now = at(end, currency);
    const before = at(start, currency);
    return [
      text(currency),
      c.money(now, currency),
      c.money(before, currency),
      c.change(
        now === null || before === null ? null : percentOf(new Decimal(now).minus(before), before),
      ),
    ];
  });
}

/** Group payroll per currency from the executive view's subsidiary rows. */
export function groupPayroll(view: ExecutiveView): MoneyByCurrency {
  const total = new Map<string, Decimal>();
  for (const entry of view.byEntity) {
    for (const [currency, amount] of Object.entries(entry.payroll)) {
      total.set(currency, (total.get(currency) ?? new Decimal(0)).plus(amount));
    }
  }
  return Object.fromEntries([...total].map(([currency, amount]) => [currency, amount.toFixed(2)]));
}

/** The months of a span, each with its overview (oldest first). */
export interface SpanInput {
  months: readonly GroupOverview[];
  end: ExecutiveView;
  /** The executive view at the end of the span before (previous quarter or year). */
  previousEnd: ExecutiveView;
}

function spanTotals(span: SpanInput) {
  const joiners = span.months.reduce((sum, month) => sum + month.joiners, 0);
  const leavers = span.months.reduce((sum, month) => sum + month.leavers, 0);
  const start = span.previousEnd.entitiesWithData === 0 ? null : span.previousEnd.headcount;
  return {
    joiners,
    leavers,
    start,
    turnover: spanTurnover(leavers, start, span.end.headcount),
  };
}

/** Per subsidiary over the span: headcount and payroll at its end, joiners and leavers in it. */
function subsidiaryRows(span: SpanInput, c: ReturnType<typeof cells>, none: string): Cell[][] {
  return span.end.byEntity.map((entry) => {
    const moves = span.months.flatMap((month) =>
      month.byEntity.filter((row) => row.entity.id === entry.entity.id),
    );
    return [
      text(entry.entity.code),
      c.count(entry.headcount),
      c.count(moves.reduce((sum, row) => sum + row.joiners, 0)),
      c.count(moves.reduce((sum, row) => sum + row.leavers, 0)),
      // Amounts in different currencies side by side, never added.
      text(
        entry.missing
          ? none
          : Object.entries(entry.payroll)
              .map(([currency, amount]) => c.f.money(amount, currency))
              .join(' · '),
      ),
      c.count(entry.openFlags),
    ];
  });
}

function spanFigures(
  context: ReportContext,
  span: SpanInput,
  labels: { headcount: string; joiners: string; leavers: string; turnover: string },
): ReportSection {
  const { t, locale } = context;
  const c = cells(locale, t('groupReports.none'));
  const totals = spanTotals(span);
  return {
    kind: 'figures',
    title: t('groupReports.keyFigures'),
    items: [
      {
        label: labels.headcount,
        value: c.f.count(span.end.headcount),
        ...(totals.start === null
          ? {}
          : {
              hint: t('groupReports.previousHeadcount', { count: c.f.count(totals.start) }),
            }),
      },
      { label: labels.joiners, value: c.f.count(totals.joiners) },
      { label: labels.leavers, value: c.f.count(totals.leavers) },
      {
        label: labels.turnover,
        value: c.f.percent(totals.turnover),
        hint: t('groupReports.turnoverHint'),
      },
      { label: t('groupReports.femaleShare'), value: c.f.percent(span.end.femaleSharePercent) },
      { label: t('groupReports.openFlags'), value: c.f.count(span.end.openFlags) },
    ],
  };
}

function subsidiarySection(context: ReportContext, title: string, span: SpanInput): ReportSection {
  const { t, locale } = context;
  const none = t('groupReports.none');
  return {
    kind: 'table',
    title,
    sheet: title.slice(0, 31),
    columns: [
      { header: t('groupReports.colSubsidiary'), weight: 1.2 },
      { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
      { header: t('groupReports.colJoiners'), weight: 1, numeric: true },
      { header: t('groupReports.colLeavers'), weight: 1, numeric: true },
      { header: t('groupReports.colPayroll'), weight: 2.4, numeric: true },
      { header: t('groupReports.colOpenFlags'), weight: 1, numeric: true },
    ],
    rows: subsidiaryRows(span, cells(locale, none), none),
    empty: none,
  };
}

function payrollSection(
  context: ReportContext,
  title: string,
  headers: { end: string; previous: string },
  span: SpanInput,
): ReportSection {
  const { t, locale } = context;
  const none = t('groupReports.none');
  return {
    kind: 'table',
    title,
    sheet: title.slice(0, 31),
    columns: [
      { header: t('groupReports.colCurrency'), weight: 1 },
      { header: headers.end, weight: 2, numeric: true },
      { header: headers.previous, weight: 2, numeric: true },
      { header: t('groupReports.colChange'), weight: 1, numeric: true },
    ],
    rows: payrollRows(groupPayroll(span.end), groupPayroll(span.previousEnd), cells(locale, none)),
    empty: none,
  };
}

/** RP-06 Quarterly group HR review (PDF, Sirius HR and executives; sent to IHC). */
export function rp06(quarter: string, span: SpanInput, context: ReportContext): ReportDocument {
  const { t, locale } = context;
  const none = t('groupReports.none');
  const c = cells(locale, none);
  const name = t('groupReports.quarter', { quarter: quarter.slice(6), year: quarter.slice(0, 4) });
  return document(context, 'RP-06', t('groupReports.rp06.title'), name, [
    spanFigures(context, span, {
      headcount: t('groupReports.rp06.headcountEnd'),
      joiners: t('groupReports.rp06.joiners'),
      leavers: t('groupReports.rp06.leavers'),
      turnover: t('groupReports.rp06.turnover'),
    }),
    {
      kind: 'table',
      title: t('groupReports.rp06.months'),
      sheet: t('groupReports.rp06.months').slice(0, 31),
      columns: [
        { header: t('groupReports.colMonth'), weight: 2 },
        { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
        { header: t('groupReports.colJoiners'), weight: 1, numeric: true },
        { header: t('groupReports.colLeavers'), weight: 1, numeric: true },
      ],
      rows: span.months.map((month) => [
        text(c.f.month(month.period)),
        c.count(month.headcount),
        c.count(month.joiners),
        c.count(month.leavers),
      ]),
      empty: none,
    },
    payrollSection(
      context,
      t('groupReports.rp06.payroll'),
      { end: t('groupReports.rp06.colEnd'), previous: t('groupReports.rp06.colPreviousEnd') },
      span,
    ),
    subsidiarySection(context, t('groupReports.rp06.bySubsidiary'), span),
    trendSection(
      context,
      t('groupReports.rp06.trend'),
      t('groupReports.rp06.trend'),
      span.end.trend,
    ),
  ]);
}

/** RP-07 Annual HR report (PDF, Sirius HR and executives; sent to IHC). */
export function rp07(
  year: string,
  span: SpanInput,
  increments: Compensation['increments'],
  context: ReportContext,
): ReportDocument {
  const { t, locale } = context;
  const none = t('groupReports.none');
  const c = cells(locale, none);
  const quarters = [0, 1, 2, 3].map((index) => span.months.slice(index * 3, index * 3 + 3));
  return document(context, 'RP-07', t('groupReports.rp07.title'), year, [
    spanFigures(context, span, {
      headcount: t('groupReports.rp07.headcountEnd'),
      joiners: t('groupReports.rp07.joiners'),
      leavers: t('groupReports.rp07.leavers'),
      turnover: t('groupReports.rp07.turnover'),
    }),
    {
      kind: 'table',
      title: t('groupReports.rp07.quarters'),
      sheet: t('groupReports.rp07.quarters').slice(0, 31),
      columns: [
        { header: t('groupReports.colQuarter'), weight: 2 },
        { header: t('groupReports.colHeadcount'), weight: 1, numeric: true },
        { header: t('groupReports.colJoiners'), weight: 1, numeric: true },
        { header: t('groupReports.colLeavers'), weight: 1, numeric: true },
      ],
      rows: quarters.map((months, index) => [
        text(t('groupReports.quarter', { quarter: String(index + 1), year })),
        // Headcount at the quarter's last month.
        c.count(months.reduce((_previous, month) => month.headcount, 0)),
        c.count(months.reduce((sum, month) => sum + month.joiners, 0)),
        c.count(months.reduce((sum, month) => sum + month.leavers, 0)),
      ]),
      empty: none,
    },
    payrollSection(
      context,
      t('groupReports.rp07.payroll'),
      { end: t('groupReports.rp07.colEnd'), previous: t('groupReports.rp07.colPreviousEnd') },
      span,
    ),
    {
      kind: 'figures',
      title: t('groupReports.rp07.increments'),
      items: [
        { label: t('groupReports.rp04.approved'), value: c.f.count(increments.approved) },
        {
          label: t('groupReports.rp04.averageIncrement'),
          value: c.f.percent(increments.averagePercent),
        },
        ...increments.distribution.map((entry) => ({
          label: t(`groupReports.buckets.${entry.bucket}`),
          value: c.f.count(entry.count),
        })),
      ],
    },
    {
      kind: 'table',
      title: t('groupReports.rp04.cost'),
      sheet: t('groupReports.rp04.sheetCost'),
      columns: [
        { header: t('groupReports.colSubsidiary'), weight: 1 },
        { header: t('groupReports.colCurrency'), weight: 1 },
        { header: t('groupReports.colEmployees'), weight: 1, numeric: true },
        { header: t('groupReports.colMonthly'), weight: 2, numeric: true },
        { header: t('groupReports.colAnnual'), weight: 2, numeric: true },
      ],
      rows: increments.costImpact.map((entry) => [
        text(entry.entity.code),
        text(entry.currency),
        c.count(entry.employees),
        c.money(entry.monthlyIncrease, entry.currency),
        c.money(entry.annualIncrease, entry.currency),
      ]),
      empty: none,
    },
    subsidiarySection(context, t('groupReports.rp07.bySubsidiary'), span),
  ]);
}
