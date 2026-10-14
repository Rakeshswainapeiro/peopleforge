'use client';

import { Field, SegmentedChoice, StatusMark, Textarea, cn } from '@peopleforge/ui';
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
  /** "To complete: add a justification, attach evidence.", or undefined when complete. */
  missingText: string | undefined;
  resultLegend: string;
  /** Null when the criterion takes no files. */
  evidence: {
    required: boolean;
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
  justificationPlaceholder: string;
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
 * Figma "2. Eligibility criteria for …" (R1-03, R1-04, R1-06): one card per criterion with its
 * result mark, Pass/Fail, a justification and evidence. Cards stay amber until complete.
 * Result and justification belong to the page's draft form and are saved with "Save draft";
 * files upload on their own. Drafts only: Sirius HR's read-only view of a submitted request is
 * part of the review screens (S5).
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
            data-complete={criterion.complete}
            className={cn(
              'rounded-card border p-5',
              criterion.complete
                ? 'border-success-200 bg-surface'
                : 'border-warning-200 bg-warning-50/40',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <StatusMark size="md" state={criterion.result ?? 'pending'} className="mt-0.5" />
                <div className="min-w-0">
                  <h3 id={`${criterion.id}-title`} className="text-sm font-semibold text-ink">
                    {criterion.code} · {criterion.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-muted">{criterion.description}</p>
                </div>
              </div>
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
              className="mt-4"
            >
              {({ id, describedBy }) => (
                <Textarea
                  key={key}
                  id={id}
                  name={`justification:${criterion.id}`}
                  form={formId}
                  defaultValue={justification}
                  maxLength={maxJustification}
                  placeholder={labels.justificationPlaceholder}
                  aria-describedby={describedBy}
                />
              )}
            </Field>

            {criterion.evidence === null ? null : (
              <div className="mt-3">
                <EvidenceFiles
                  requestId={requestId}
                  lineId={lineId}
                  criterionId={criterion.id}
                  files={criterion.evidence.files}
                  accept={criterion.evidence.accept}
                  maxBytes={criterion.evidence.maxBytes}
                  required={criterion.evidence.required}
                  canAdd={criterion.evidence.canAdd}
                  labels={criterion.evidence.labels}
                  messages={messages}
                />
              </div>
            )}

            {criterion.missingText === undefined ? null : (
              <p id={hintId} className="mt-3 text-xs text-warning-700">
                {criterion.missingText}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
