'use client';

import { Badge, Field, SegmentedChoice, Textarea } from '@peopleforge/ui';
import { useDraftForm } from './draft-form';
import { EvidenceFiles, type EvidenceFileView, type EvidenceFilesLabels } from './evidence-files';

/** One criterion for the employee being assessed, formatted and translated by the server. */
export interface CriterionCardView {
  id: string;
  code: string;
  name: string;
  description: string;
  justificationRequired: boolean;
  result: 'pass' | 'fail' | null;
  justification: string;
  complete: boolean;
  /** "To complete: choose Pass or Fail · attach evidence", or undefined when complete. */
  missingText: string | undefined;
  resultLegend: string;
  /** Null when the criterion takes no files. */
  evidence: {
    /** "Required" / "Optional". */
    policyLabel: string;
    /** "PDF, PNG · up to 10 MB each · at most 5 files". */
    rules: string;
    accept: string;
    maxBytes: number;
    canAdd: boolean;
    files: readonly EvidenceFileView[];
    labels: EvidenceFilesLabels;
  } | null;
}

export interface CriteriaEditorLabels {
  pass: string;
  fail: string;
  justification: string;
  justificationHint: string;
  evidence: string;
  noEvidenceNeeded: string;
  complete: string;
  incomplete: string;
}

export interface CriteriaEditorProps {
  requestId: string;
  lineId: string;
  criteria: readonly CriterionCardView[];
  labels: CriteriaEditorLabels;
  maxJustification: number;
  /** Translated texts for evidence error keys, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
}

/**
 * Figma "2. Eligibility criteria" for one employee (R1-03, R1-04, R1-06): Pass/Fail, a
 * justification and evidence per criterion. Result and justification belong to the page's
 * draft form and are saved with "Save draft"; files upload on their own. Drafts only: Sirius
 * HR's read-only view of a submitted request is part of the review screens (S5).
 */
export function CriteriaEditor({
  requestId,
  lineId,
  criteria,
  labels,
  maxJustification,
  messages,
}: CriteriaEditorProps) {
  const { formId, state } = useDraftForm();
  // After a refused save, start from what was typed for this employee.
  const typed = state.criteria?.lineId === lineId ? state.criteria.results : [];

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="assessmentLineId" value={lineId} form={formId} />
      {criteria.map((criterion) => {
        const entry = typed.find((candidate) => candidate.criterionId === criterion.id);
        const result = entry === undefined ? (criterion.result ?? undefined) : entry.result;
        const justification = entry?.justification ?? criterion.justification;
        // Remount after a refused save so the controls start from the typed values.
        const key = `${criterion.id}:${entry === undefined ? 'saved' : `${entry.result}:${entry.justification}`}`;
        const hintId = `${criterion.id}-missing`;
        return (
          <article
            key={criterion.id}
            aria-labelledby={`${criterion.id}-title`}
            aria-describedby={criterion.missingText === undefined ? undefined : hintId}
            className="rounded-card border border-line p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={`${criterion.id}-title`} className="text-base font-semibold text-ink">
                  <span className="text-ink-muted">{criterion.code}</span> · {criterion.name}
                </h3>
                <p className="mt-1 text-sm text-ink-muted">{criterion.description}</p>
              </div>
              <Badge
                tone={criterion.complete ? 'success' : 'outline'}
                icon={criterion.complete ? 'check' : 'circle'}
              >
                {criterion.complete ? labels.complete : labels.incomplete}
              </Badge>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[auto_1fr]">
              <div>
                <input type="hidden" name="criterionId" value={criterion.id} form={formId} />
                <SegmentedChoice
                  key={key}
                  name={`result:${criterion.id}`}
                  form={formId}
                  legend={criterion.resultLegend}
                  defaultValue={result}
                  size="md"
                  options={[
                    { value: 'pass', label: labels.pass, tone: 'success', icon: 'check' },
                    { value: 'fail', label: labels.fail, tone: 'danger', icon: 'x' },
                  ]}
                />
              </div>
              <Field
                label={labels.justification}
                required={criterion.justificationRequired}
                hint={labels.justificationHint}
              >
                {({ id, describedBy }) => (
                  <Textarea
                    key={key}
                    id={id}
                    name={`justification:${criterion.id}`}
                    form={formId}
                    defaultValue={justification}
                    maxLength={maxJustification}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-medium text-ink">{labels.evidence}</h4>
                {criterion.evidence === null ? (
                  <span className="text-xs text-ink-subtle">{labels.noEvidenceNeeded}</span>
                ) : (
                  <>
                    <Badge tone="neutral">{criterion.evidence.policyLabel}</Badge>
                    <span className="text-xs text-ink-subtle">{criterion.evidence.rules}</span>
                  </>
                )}
              </div>
              {criterion.evidence === null ? null : (
                <EvidenceFiles
                  requestId={requestId}
                  lineId={lineId}
                  criterionId={criterion.id}
                  files={criterion.evidence.files}
                  accept={criterion.evidence.accept}
                  maxBytes={criterion.evidence.maxBytes}
                  canAdd={criterion.evidence.canAdd}
                  labels={criterion.evidence.labels}
                  messages={messages}
                />
              )}
            </div>

            {criterion.missingText === undefined ? null : (
              <p id={hintId} className="mt-4 text-xs font-medium text-warning-700">
                {criterion.missingText}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
