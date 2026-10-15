import {
  MAX_EVIDENCE_PER_CRITERION,
  type CriterionAssessment,
  type CriterionMissing,
  type IncrementRequest,
  type RequestLine,
} from '@peopleforge/contracts';
import type { CriterionState, Step } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import type {
  CriteriaEditorLabels,
  CriterionCardView,
} from '@/components/requests/criteria-editor';
import type { ProposalRowView, ProposalsTableLabels } from '@/components/requests/proposals-table';
import type { ReadyPanelProps } from '@/components/requests/ready-panel';
import type { MessageKey, Translate } from '@/i18n/translator';
import { formatDate, formatFileSize, formatMoney, formatPercent, trimDecimal } from './format';
import { pluralForm } from './plural';
import { EVIDENCE_ERROR_KEYS, REQUEST_ERROR_KEYS } from './request-errors';
import { localised } from './viewer-display';

/**
 * A criterion's mark in the table: its result once complete, "not complete yet" before (also
 * for a criterion the API left out, e.g. during a rolling deploy).
 */
function criterionState(assessment: CriterionAssessment | undefined): CriterionState {
  return assessment?.missing.length === 0 && assessment.result !== null
    ? assessment.result
    : 'pending';
}

function completeCount(line: RequestLine): number {
  return line.criteria.filter((assessment) => assessment.missing.length === 0).length;
}

/** Server-side view model for the proposals table: formatted, labelled, translated. */
export function proposalRows(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): ProposalRowView[] {
  return request.lines.map((line) => ({
    lineId: line.id,
    fullName: line.fullName,
    employeeNumber: line.employeeNumber,
    grade: line.grade,
    currencyCode: line.currency,
    current: formatMoney(line.currentSalary, line.currency, locale),
    criteria: request.criteria.map((criterion, index) => ({
      code: criterion.code,
      // The API returns a line's criteria in the request's criteria order.
      state: criterionState(line.criteria.at(index)),
    })),
    criteriaLabel: t('request.criteriaComplete', {
      done: completeCount(line),
      total: request.criteria.length,
    }),
    kind: line.proposedKind ?? 'percent',
    value: line.proposedValue === null ? '' : trimDecimal(line.proposedValue),
    labels: {
      proposedAs: t('request.proposedAsFor', { name: line.fullName }),
      value: t('request.valueFor', { name: line.fullName }),
      remove: t('request.remove', { name: line.fullName }),
      assess: t('request.assess', { name: line.fullName }),
    },
  }));
}

const MEDIA_TYPE_KEYS = new Map<string, MessageKey>([
  ['application/pdf', 'request.fileTypes.pdf'],
  ['image/jpeg', 'request.fileTypes.jpeg'],
  ['image/png', 'request.fileTypes.png'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'request.fileTypes.xlsx'],
]);

/** "PDF", "Excel"…; a type without a name shows as itself (it is configuration, not text). */
function mediaTypeLabel(mediaType: string, t: Translate): string {
  const key = MEDIA_TYPE_KEYS.get(mediaType);
  return key === undefined ? mediaType : t(key);
}

function list(items: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(locale, { style: 'short', type: 'unit' }).format(items);
}

function missingKey(item: CriterionMissing): MessageKey {
  switch (item) {
    case 'result':
      return 'request.missing.result';
    case 'justification':
      return 'request.missing.justification';
    case 'evidence':
      return 'request.missing.evidence';
  }
}

/** Figma "2. Eligibility criteria": one card per criterion for the employee being assessed. */
export function criteriaCards(
  request: IncrementRequest,
  line: RequestLine,
  locale: Locale,
  t: Translate,
): CriterionCardView[] {
  return request.criteria.map((criterion, index) => {
    const assessment = line.criteria.at(index);
    const missing = assessment?.missing ?? ['result', 'justification', 'evidence'];
    const files = assessment?.evidence ?? [];
    return {
      id: criterion.id,
      code: criterion.code,
      name: localised(criterion.name, locale),
      description: localised(criterion.description, locale),
      justificationRequired: criterion.justificationRequired,
      result: assessment?.result ?? null,
      justification: assessment?.justification ?? '',
      complete: missing.length === 0,
      missingText:
        missing.length === 0
          ? undefined
          : t('request.toComplete', {
              items: list(
                missing.map((item) => t(missingKey(item))),
                locale,
              ),
            }),
      resultLegend: t('request.resultFor', { code: criterion.code }),
      evidence:
        criterion.evidencePolicy === 'none'
          ? null
          : {
              required: criterion.evidencePolicy === 'required',
              accept: criterion.allowedMediaTypes.join(','),
              maxBytes: criterion.maxFileMb * 1024 * 1024,
              canAdd: files.length < MAX_EVIDENCE_PER_CRITERION,
              files: files.map((file) => ({
                id: file.id,
                fileName: file.fileName,
                meta: `${mediaTypeLabel(file.mediaType, t)} · ${formatFileSize(file.sizeBytes, locale)}`,
                href: `/requests/${request.id}/evidence/${file.id}`,
                downloadLabel: t('request.downloadFile', { file: file.fileName }),
                removeLabel: t('request.removeFile', { file: file.fileName }),
              })),
              labels: {
                attach: t('request.attachFile'),
                attachFor: t('request.attachFor', { code: criterion.code }),
                uploading: t('request.uploading'),
                // Figma: "PDF, JPG, PNG, XLSX · max 10 MB".
                rules: t('request.evidenceRules', {
                  types: list(
                    criterion.allowedMediaTypes.map((type) => mediaTypeLabel(type, t)),
                    locale,
                  ),
                  size: formatFileSize(criterion.maxFileMb * 1024 * 1024, locale),
                }),
                required: t('request.evidenceRequiredMark'),
              },
            },
    };
  });
}

export function criteriaLabels(t: Translate): CriteriaEditorLabels {
  return {
    pass: t('request.pass'),
    fail: t('request.fail'),
    justification: t('request.justification'),
    justificationPlaceholder: t('request.justificationPlaceholder'),
  };
}

/** Every message an evidence upload or removal can return, translated, for the client. */
export function evidenceMessages(t: Translate): [string, string][] {
  return EVIDENCE_ERROR_KEYS.map((key) => [key, t(key)]);
}

/** "1 criterion incomplete" / "5 criteria incomplete", by the locale's plural rules. */
function criteriaIncomplete(count: number, locale: Locale, t: Translate): string {
  const form = pluralForm(count, locale);
  return t(`request.criteriaIncomplete.${form}`, {
    count: new Intl.NumberFormat(locale).format(count),
  });
}

/**
 * Figma "3. Ready to submit?": a row per employee ("All 5 criteria complete" / "5 criteria
 * incomplete"), and a note saying what still blocks submitting. Ready = a proposed increment
 * and every criterion complete (the API's `totals.ready`).
 */
export function readyView(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
  submitKey: string,
): ReadyPanelProps {
  const number = new Intl.NumberFormat(locale);
  const total = request.criteria.length;
  const rows = request.lines.map((line) => ({
    line,
    open: line.criteria.length - completeCount(line),
    proposed: line.proposedValue !== null,
  }));
  const withOpenCriteria = rows.filter((row) => row.open > 0).length;
  const withoutProposal = rows.filter((row) => !row.proposed).length;
  const employees = number.format(request.lines.length);
  const note =
    withOpenCriteria > 0
      ? t('request.notReadyCriteria', {
          count: number.format(withOpenCriteria),
          total: employees,
          criteria: number.format(total),
        })
      : withoutProposal > 0
        ? t('request.notReadyProposals', {
            count: number.format(withoutProposal),
            total: employees,
          })
        : t('request.allReady');
  return {
    items: rows.map(({ line, open, proposed }) => {
      const needs = [
        ...(open === 0 ? [] : [criteriaIncomplete(open, locale, t)]),
        ...(proposed ? [] : [t('request.noProposal')]),
      ];
      return {
        lineId: line.id,
        fullName: line.fullName,
        ready: needs.length === 0,
        status:
          needs.length === 0
            ? t('request.allCriteriaComplete', { count: number.format(total) })
            : needs.join(' · '),
      };
    }),
    note,
    canSubmit: request.lines.length > 0 && request.totals.ready === request.lines.length,
    submitKey,
    submitLabels: {
      submit: t('request.submit'),
      submitting: t('request.submitting'),
      cancel: t('request.cancel'),
      title: t('request.submitConfirmTitle', { reference: request.reference }),
      body: t(`request.submitConfirmBody.${pluralForm(request.lines.length, locale)}`, {
        count: employees,
      }),
      unsaved: t('request.submitConfirmUnsaved'),
    },
    caption: t('request.submitCaption'),
  };
}

export interface TotalsView {
  employees: string;
  increase: string;
  average: string;
}

/** Figma: "Employees: 4   Total proposed increase: AED 4,488 / month   Average: 6.6%". */
export function totalsView(request: IncrementRequest, locale: Locale, t: Translate): TotalsView {
  const { totals } = request;
  const increase =
    totals.increaseByCurrency.length === 0
      ? t('request.notSet')
      : totals.increaseByCurrency
          .map((sum) =>
            t('request.perMonth', { amount: formatMoney(sum.amount, sum.currency, locale) }),
          )
          .join(' + ');
  return {
    employees: new Intl.NumberFormat(locale).format(totals.employees),
    increase,
    average:
      totals.averagePercent === null
        ? t('request.notSet')
        : formatPercent(totals.averagePercent, locale),
  };
}

export function tableLabels(t: Translate): ProposalsTableLabels {
  return {
    caption: t('request.tableCaption'),
    colEmployee: t('request.colEmployee'),
    colGrade: t('request.colGrade'),
    colCurrent: t('request.colCurrent'),
    colProposedAs: t('request.colProposedAs'),
    colValue: t('request.colValue'),
    colCriteria: t('request.colCriteria'),
    criterionStates: {
      pass: t('request.criterionState.pass'),
      fail: t('request.criterionState.fail'),
      pending: t('request.criterionState.pending'),
    },
    colActions: t('request.colActions'),
    percentOption: t('request.percentOption'),
    valuePlaceholder: t('request.valuePlaceholder'),
    saving: t('request.saving'),
  };
}

const ROW_ERROR_KEYS = [
  'request.errors.notPositive',
  'request.errors.overLimit',
  'request.errors.format',
] as const satisfies readonly MessageKey[];

/** Every message the save can return, translated, for the client table. */
export function saveMessages(t: Translate): [string, string][] {
  return [...REQUEST_ERROR_KEYS, ...ROW_ERROR_KEYS].map((key) => [key, t(key)]);
}

/** "1 employee added" / "4 employees added", by the locale's plural rules. */
export function employeesAdded(count: number, locale: Locale, t: Translate): string {
  const form = pluralForm(count, locale);
  return t(`request.employeesAdded.${form}`, {
    count: new Intl.NumberFormat(locale).format(count),
  });
}

/**
 * Figma "Progress" for a request: Added → Submitted to Sirius HR → Review → Decision. Review
 * and decisions arrive with S5, so a submitted request waits at Review.
 */
export function progressSteps(request: IncrementRequest, locale: Locale, t: Translate): Step[] {
  const submitted = request.submittedAt;
  return [
    {
      label: t('request.progressSteps.added'),
      detail: formatDate(request.createdAt, locale),
      state: 'done',
    },
    {
      label: t('request.progressSteps.submitted'),
      detail: submitted === null ? t('request.progressPending') : formatDate(submitted, locale),
      state: submitted === null ? 'current' : 'done',
    },
    {
      label: t('request.progressSteps.review'),
      detail: t('request.progressPending'),
      state: submitted === null ? 'todo' : 'current',
    },
    {
      label: t('request.progressSteps.decision'),
      detail: t('request.progressPending'),
      state: 'todo',
    },
  ];
}
