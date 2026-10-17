import {
  MAX_COMMENT_LENGTH,
  MAX_EVIDENCE_PER_CRITERION,
  type CriterionAssessment,
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
import type { SubmitDialogView } from '@/components/requests/submit-control';
import type { MessageKey, Translate } from '@/i18n/translator';
import { formatDate, formatFileSize, formatMoney, formatPercent, trimDecimal } from './format';
import { pluralForm } from '@peopleforge/i18n';
import { requestFigures } from './request-figures';
import { EVIDENCE_ERROR_KEYS, REQUEST_ERROR_KEYS } from './request-errors';
import { localised } from './viewer-display';
import { evidenceHref } from './routes';
import { stageView } from './dashboard-view';

/**
 * A criterion's mark in the table: its result once complete, "not complete yet" before (also
 * for a criterion the API left out, e.g. during a rolling deploy).
 */
export function criterionState(assessment: CriterionAssessment | undefined): CriterionState {
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
    locked: request.status === 'returned' && line.reviewStatus !== 'returned',
    lockedLabel: t('resubmit.locked'),
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

/** Figma "2. Eligibility criteria": one card per criterion for the employee being assessed. */
export function criteriaCards(
  request: IncrementRequest,
  line: RequestLine,
  locale: Locale,
  t: Translate,
): CriterionCardView[] {
  return request.criteria.map((criterion, index) => {
    const assessment = line.criteria.at(index);
    const files = assessment?.evidence ?? [];
    return {
      id: criterion.id,
      code: criterion.code,
      name: localised(criterion.name, locale),
      description: localised(criterion.description, locale),
      rule: {
        justificationRequired: criterion.justificationRequired,
        evidencePolicy: criterion.evidencePolicy,
      },
      result: assessment?.result ?? null,
      justification: assessment?.justification ?? '',
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
                href: evidenceHref(request.id, file.id),
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
    missing: {
      toComplete: t('request.toComplete'),
      items: {
        result: t('request.missing.result'),
        justification: t('request.missing.justification'),
        evidence: t('request.missing.evidence'),
      },
    },
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
 * The employees a submission sends: every one of a draft, or only those Sirius HR returned
 * (R1-08); the others stay with Sirius HR.
 */
export function linesToSend(request: IncrementRequest): RequestLine[] {
  return request.status === 'returned'
    ? request.lines.filter((line) => line.reviewStatus === 'returned')
    : request.lines;
}

/**
 * Figma "3. Ready to submit?": a row per employee ("All 5 criteria complete" / "5 criteria
 * incomplete"), and a note saying what still blocks submitting. Ready = a proposed increment
 * and every criterion complete. For a returned request, the same for its returned employees,
 * resubmitted with an optional note.
 */
export function readyView(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
  submitKey: string,
): ReadyPanelProps {
  const number = new Intl.NumberFormat(locale);
  const total = request.criteria.length;
  const fixing = request.status === 'returned';
  const lines = linesToSend(request);
  const rows = lines.map((line) => ({
    line,
    open: line.criteria.length - completeCount(line),
    proposed: line.proposedValue !== null,
  }));
  const withOpenCriteria = rows.filter((row) => row.open > 0).length;
  const withoutProposal = rows.filter((row) => !row.proposed).length;
  const employees = number.format(lines.length);
  const notReady = rows.filter((row) => row.open > 0 || !row.proposed).length;
  const note = fixing
    ? notReady > 0
      ? t(`resubmit.notReady.${pluralForm(notReady, locale)}`, { count: number.format(notReady) })
      : t('resubmit.allReady')
    : withOpenCriteria > 0
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
    canSubmit: lines.length > 0 && notReady === 0,
    submitKey,
    submitLabels: fixing
      ? {
          submit: t('resubmit.submit'),
          confirm: t('resubmit.confirm'),
          submitting: t('request.submitting'),
          back: t('request.submitBack'),
        }
      : {
          submit: t('request.submit'),
          confirm: t('request.submitConfirm'),
          submitting: t('request.submitting'),
          back: t('request.submitBack'),
        },
    submitDialog: submitDialogView(request, locale, t),
    caption: fixing ? t('resubmit.caption') : t('request.submitCaption'),
    ...(fixing
      ? {
          intent: 'resubmit' as const,
          noteField: {
            label: t('resubmit.note'),
            placeholder: t('resubmit.notePlaceholder'),
            maxLength: MAX_COMMENT_LENGTH,
          },
        }
      : {}),
  };
}

/** Figma "Submit INC-2026-0152 to Sirius HR?": the figures and every employee about to go. */
export function submitDialogView(
  request: IncrementRequest,
  locale: Locale,
  t: Translate,
): SubmitDialogView {
  const number = new Intl.NumberFormat(locale);
  const total = number.format(request.criteria.length);
  const fixing = request.status === 'returned';
  return {
    title: fixing
      ? t('resubmit.confirmTitle', { reference: request.reference })
      : t('request.submitConfirmTitle', { reference: request.reference }),
    intro: fixing ? t('resubmit.confirmIntro') : t('request.submitConfirmIntro'),
    figures: requestFigures(request, locale, t).map(({ label, value }) => ({ label, value })),
    table: {
      caption: t('request.submitTableCaption'),
      employee: t('request.colEmployee'),
      grade: t('request.colGrade'),
      proposed: t('request.colProposed'),
      criteria: t('request.colCriteria'),
    },
    rows: linesToSend(request).map((line) => ({
      id: line.id,
      name: line.fullName,
      number: line.employeeNumber,
      grade: line.grade,
      proposed: line.percent === null ? t('request.notSet') : formatPercent(line.percent, locale),
      criteria: t('request.criteriaOf', {
        complete: number.format(completeCount(line)),
        total,
      }),
    })),
    note: fixing ? t('resubmit.confirmNote') : t('request.submitConfirmNote', { of: total }),
    unsaved: t('request.submitConfirmUnsaved'),
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
 * Figma "Progress" for a request: Added → Submitted to Sirius HR → Review → Decision (R1-10).
 * Review shows the stage while Sirius HR checks criteria; Decision is done once every employee
 * is decided.
 */
export function progressSteps(request: IncrementRequest, locale: Locale, t: Translate): Step[] {
  const submitted = request.submittedAt;
  const decided = request.decidedAt;
  const reviewed = decided !== null || request.stage.kind === 'decision';
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
      detail:
        submitted === null
          ? t('request.progressPending')
          : stageView(request.stage, locale, t).label,
      state: submitted === null ? 'todo' : reviewed ? 'done' : 'current',
    },
    {
      label: t('request.progressSteps.decision'),
      detail: decided === null ? t('request.progressPending') : formatDate(decided, locale),
      state: decided !== null ? 'done' : reviewed ? 'current' : 'todo',
    },
  ];
}

/** What each criterion mark means, for its tooltip (dashboard and request tables). */
export function markStateLabels(t: Translate): Record<CriterionState, string> {
  return {
    pass: t('dashboard.markStates.pass'),
    fail: t('dashboard.markStates.fail'),
    pending: t('dashboard.markStates.pending'),
  };
}
