'use client';

import type { CriterionRule } from '@peopleforge/contracts';
import { Field, SegmentedChoice, StatusMark, Textarea, cn } from '@peopleforge/ui';
import type { Locale } from '@sirius/shared-types';
import { useState } from 'react';
import { criterionStatus, type MissingLabels } from '@/lib/criterion-status';
import { useDraftForm } from './draft-form';
import { EvidenceFiles, type EvidenceFileView, type EvidenceFilesLabels } from './evidence-files';

/** One criterion for the employee being assessed, formatted and translated by the server. */
export interface CriterionCardView {
  id: string;
  code: string;
  name: string;
  description: string;
  /** What the criterion asks for (configuration, R1-05): the card's status follows it live. */
  rule: CriterionRule;
  /** As saved. */
  result: 'pass' | 'fail' | null;
  justification: string;
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
  missing: MissingLabels;
}

export interface CriteriaEditorProps {
  requestId: string;
  lineId: string;
  criteria: readonly CriterionCardView[];
  labels: CriteriaEditorLabels;
  maxJustification: number;
  /** Translated texts for evidence error keys, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
  locale: Locale;
}

/** A posted radio value as a result; anything else (nothing chosen) as none. */
function resultOf(value: string): 'pass' | 'fail' | undefined {
  return value === 'pass' || value === 'fail' ? value : undefined;
}

interface CriterionCardProps {
  criterion: CriterionCardView;
  resetKey: string;
  requestId: string;
  lineId: string;
  formId: string;
  initialResult: 'pass' | 'fail' | undefined;
  initialJustification: string;
  labels: CriteriaEditorLabels;
  maxJustification: number;
  messages: readonly (readonly [string, string])[];
  locale: Locale;
}

/**
 * One criterion card. Its mark, colour and "To complete" line follow what is on screen as the
 * user chooses and types (before saving), with the same rule the API applies when it saves, so
 * a choice is never shown as missing (Figma: the mark shows the chosen result at once).
 */
function CriterionCard({
  criterion,
  resetKey,
  requestId,
  lineId,
  formId,
  initialResult,
  initialJustification,
  labels,
  maxJustification,
  messages,
  locale,
}: CriterionCardProps) {
  const [result, setResult] = useState(initialResult);
  const [justification, setJustification] = useState(initialJustification);
  // A refused save brings back what was typed: start again from it (state reset during render,
  // React's pattern for props that replace state). The card itself stays, so focus isn't lost.
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setResult(initialResult);
    setJustification(initialJustification);
  }
  const status = criterionStatus(
    criterion.rule,
    {
      result: result ?? null,
      justification,
      evidenceCount: criterion.evidence?.files.length ?? 0,
    },
    labels.missing,
    locale,
  );
  const hintId = `${criterion.id}-missing`;
  return (
    <article
      aria-labelledby={`${criterion.id}-title`}
      aria-describedby={status.text === undefined ? undefined : hintId}
      data-complete={status.complete}
      className={cn(
        'rounded-card border p-5 transition-colors duration-200',
        status.complete ? 'border-success-200 bg-surface' : 'border-warning-200 bg-warning-50/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <StatusMark size="md" state={result ?? 'pending'} className="mt-0.5" />
          <div className="min-w-0">
            <h3 id={`${criterion.id}-title`} className="text-sm font-semibold text-ink">
              {criterion.code} · {criterion.name}
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">{criterion.description}</p>
          </div>
        </div>
        <input type="hidden" name="criterionId" value={criterion.id} form={formId} />
        <SegmentedChoice
          key={resetKey}
          name={`result:${criterion.id}`}
          form={formId}
          legend={criterion.resultLegend}
          defaultValue={initialResult}
          size="md"
          onValueChange={(value) => {
            setResult(resultOf(value));
          }}
          options={[
            { value: 'pass', label: labels.pass, tone: 'success', icon: 'check' },
            { value: 'fail', label: labels.fail, tone: 'danger', icon: 'x' },
          ]}
        />
      </div>

      <Field
        label={labels.justification}
        required={criterion.rule.justificationRequired}
        className="mt-4"
      >
        {({ id, describedBy }) => (
          <Textarea
            key={resetKey}
            id={id}
            name={`justification:${criterion.id}`}
            form={formId}
            defaultValue={initialJustification}
            maxLength={maxJustification}
            placeholder={labels.justificationPlaceholder}
            aria-describedby={describedBy}
            onChange={(event) => {
              setJustification(event.target.value);
            }}
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

      {/* Announced politely as it changes, so screen-reader users hear what is left. */}
      <p id={hintId} role="status" className="mt-3 text-xs text-warning-700">
        {status.text}
      </p>
    </article>
  );
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
  locale,
}: CriteriaEditorProps) {
  const { formId, state } = useDraftForm();
  // After a refused save, start from what was typed for this employee.
  const typed = state.criteria?.lineId === lineId ? state.criteria.results : [];

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="assessmentLineId" value={lineId} form={formId} />
      {criteria.map((criterion) => {
        const entry = typed.find((candidate) => candidate.criterionId === criterion.id);
        const result =
          entry === undefined ? (criterion.result ?? undefined) : resultOf(entry.result);
        const justification = entry?.justification ?? criterion.justification;
        return (
          <CriterionCard
            key={criterion.id}
            // Changes after a refused save, so the controls start again from the typed values.
            resetKey={entry === undefined ? 'saved' : `${entry.result}:${entry.justification}`}
            criterion={criterion}
            requestId={requestId}
            lineId={lineId}
            formId={formId}
            initialResult={result}
            initialJustification={justification}
            labels={labels}
            maxJustification={maxJustification}
            messages={messages}
            locale={locale}
          />
        );
      })}
    </div>
  );
}
