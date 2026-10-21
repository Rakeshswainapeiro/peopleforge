import type { IncrementAnalytics } from '@peopleforge/contracts';
import type { Locale } from '@sirius/shared-types';
import ExcelJS from 'exceljs';
import type { ApiTranslate } from '../../i18n.js';
import { dateTimeIn } from '../reports/report-labels.js';
import { safeText, sheet } from '../reports/xlsx.js';

export interface TatWorkbookMeta {
  locale: Locale;
  generated: string;
  filters: string;
}

const DAYS = '0.0';

/** "2.5" as a number cell, so Excel sums and sorts it; none stays empty. */
function number(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * RP-02, turnaround time and back-and-forth (R1-11, R1-12, R1-14) as an Excel workbook for
 * Sirius HR: Summary with the definitions, then TAT by request, criterion and subsidiary, and
 * back-and-forth by request and subsidiary. No pay, no employees' names.
 */
export async function tatWorkbook(
  analytics: IncrementAnalytics,
  t: ApiTranslate,
  meta: TatWorkbookMeta,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeopleForge';
  const dateTime = dateTimeIn(meta.locale, t('reports.none'));
  const { tat, backAndForth } = analytics;

  const summary = workbook.addWorksheet(safeText(t('analytics.sheets.summary')));
  summary.columns = [{ width: 48 }, { width: 14 }];
  const lines: (readonly [string, number | null])[] = [
    [`${t('analytics.code')} · ${t('analytics.title')}`, null],
    [meta.generated, null],
    [meta.filters, null],
    ['', null],
    [t('analytics.figures.requests'), tat.requests],
    [t('analytics.figures.decided'), tat.decided],
    [t('analytics.figures.averageTat'), number(tat.averageDays)],
    [t('analytics.figures.medianTat'), number(tat.medianDays)],
    [t('analytics.figures.open'), tat.open],
    [t('analytics.figures.openAverage'), number(tat.openAverageDays)],
    [t('analytics.figures.returns'), backAndForth.returns],
    [t('analytics.figures.openReturns'), backAndForth.openReturns],
    [t('analytics.figures.averageReturn'), number(backAndForth.averageReturnDays)],
    [t('analytics.figures.questions'), backAndForth.questions],
    [t('analytics.figures.averageAnswer'), number(backAndForth.averageAnswerDays)],
    ['', null],
    [t('analytics.notes.tat'), null],
    [t('analytics.notes.criterion'), null],
    [t('analytics.notes.trend'), null],
    [t('analytics.notes.backAndForth'), null],
  ];
  for (const [text, value] of lines) summary.addRow([safeText(text), value]);
  summary.getRow(1).font = { bold: true, size: 14 };

  sheet(
    workbook,
    t('analytics.sheets.tatRequests'),
    [
      { header: t('reports.colRequest'), width: 16 },
      { header: t('reports.colSubsidiary'), width: 12 },
      { header: t('reports.colStatus'), width: 16 },
      { header: t('reports.colEmployees'), width: 11 },
      { header: t('reports.colSubmitted'), width: 20 },
      { header: t('reports.colDecided'), width: 20 },
      { header: t('reports.colTat'), width: 11, numFmt: DAYS },
      { header: t('analytics.columns.open'), width: 8 },
    ],
    tat.byRequest.map((row) => [
      row.reference,
      row.entityCode,
      t(`statuses.${row.status}`),
      row.employees,
      dateTime(new Date(row.submittedAt)),
      dateTime(row.decidedAt === null ? null : new Date(row.decidedAt)),
      Number(row.days),
      t(row.open ? 'analytics.columns.yes' : 'analytics.columns.no'),
    ]),
  );

  sheet(
    workbook,
    t('analytics.sheets.tatCriteria'),
    [
      { header: t('analytics.columns.criterion'), width: 12 },
      { header: t('analytics.columns.verified'), width: 10 },
      { header: t('analytics.columns.average'), width: 14, numFmt: DAYS },
      { header: t('analytics.columns.median'), width: 14, numFmt: DAYS },
      { header: t('analytics.columns.longest'), width: 14, numFmt: DAYS },
    ],
    tat.byCriterion.map((row) => [
      row.code,
      row.verified,
      number(row.averageDays),
      number(row.medianDays),
      number(row.maxDays),
    ]),
  );

  sheet(
    workbook,
    t('analytics.sheets.trend'),
    [
      { header: t('analytics.columns.month'), width: 12 },
      { header: t('analytics.columns.count'), width: 10 },
      { header: t('analytics.columns.average'), width: 14, numFmt: DAYS },
      { header: t('analytics.columns.median'), width: 14, numFmt: DAYS },
    ],
    tat.trend.map((row) => [row.month, row.count, number(row.averageDays), number(row.medianDays)]),
  );

  sheet(
    workbook,
    t('analytics.sheets.tatEntities'),
    [
      { header: t('reports.colSubsidiary'), width: 12 },
      { header: t('analytics.columns.requests'), width: 10 },
      { header: t('analytics.columns.decided'), width: 10 },
      { header: t('analytics.columns.averageTat'), width: 18, numFmt: DAYS },
      { header: t('analytics.columns.openAverage'), width: 22, numFmt: DAYS },
    ],
    tat.byEntity.map((row) => [
      row.entityCode,
      row.requests,
      row.decided,
      number(row.averageDays),
      number(row.openAverageDays),
    ]),
  );

  sheet(
    workbook,
    t('analytics.sheets.flowRequests'),
    [
      { header: t('reports.colRequest'), width: 16 },
      { header: t('reports.colSubsidiary'), width: 12 },
      { header: t('reports.colStatus'), width: 16 },
      { header: t('analytics.columns.returns'), width: 9 },
      { header: t('analytics.columns.openReturns'), width: 12 },
      { header: t('analytics.columns.daysWithSubsidiary'), width: 22, numFmt: DAYS },
      { header: t('analytics.columns.questions'), width: 10 },
      { header: t('analytics.columns.answers'), width: 10 },
      { header: t('analytics.columns.averageAnswer'), width: 20, numFmt: DAYS },
    ],
    backAndForth.byRequest.map((row) => [
      row.reference,
      row.entityCode,
      t(`statuses.${row.status}`),
      row.returns,
      row.openReturns,
      Number(row.daysWithSubsidiary),
      row.questions,
      row.answers,
      number(row.averageAnswerDays),
    ]),
  );

  sheet(
    workbook,
    t('analytics.sheets.flowEntities'),
    [
      { header: t('reports.colSubsidiary'), width: 12 },
      { header: t('analytics.columns.requests'), width: 10 },
      { header: t('analytics.columns.returns'), width: 9 },
      { header: t('analytics.columns.averageReturn'), width: 20, numFmt: DAYS },
      { header: t('analytics.columns.questions'), width: 10 },
      { header: t('analytics.columns.averageAnswer'), width: 20, numFmt: DAYS },
    ],
    backAndForth.byEntity.map((row) => [
      row.entityCode,
      row.requests,
      row.returns,
      number(row.averageReturnDays),
      row.questions,
      number(row.averageAnswerDays),
    ]),
  );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
