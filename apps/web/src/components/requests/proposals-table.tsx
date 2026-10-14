'use client';

import {
  Alert,
  Button,
  CellStack,
  CriteriaProgress,
  type CriterionState,
  Input,
  SegmentedChoice,
  Spinner,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  Icon,
  cn,
  focusRing,
  transition,
} from '@peopleforge/ui';
import { useActionState } from 'react';
import {
  removeEmployeeAction,
  saveDraft,
  type ProposalsFormState,
} from '@/app/(portal)/requests/actions';

/** One employee row, already formatted and labelled by the server (i18n stays server-side). */
export interface ProposalRowView {
  lineId: string;
  fullName: string;
  employeeNumber: string;
  grade: string;
  currencyCode: string;
  current: string;
  criteria: readonly { code: string; state: CriterionState }[];
  criteriaLabel: string;
  kind: 'percent' | 'amount';
  value: string;
  labels: { proposedAs: string; value: string; remove: string };
}

export interface ProposalsTableLabels {
  caption: string;
  colEmployee: string;
  colGrade: string;
  colCurrent: string;
  colProposedAs: string;
  colValue: string;
  colCriteria: string;
  criterionStates: Readonly<Record<CriterionState, string>>;
  colActions: string;
  percentOption: string;
  valuePlaceholder: string;
  save: string;
  saving: string;
}

export interface ProposalsTableProps {
  formId: string;
  requestId: string;
  version: number;
  editable: boolean;
  rows: readonly ProposalRowView[];
  labels: ProposalsTableLabels;
  /** Translated texts for the error keys the save can return, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
  /** The totals line under the table. */
  footer: React.ReactNode;
}

const INITIAL: ProposalsFormState = { rows: [] };

/**
 * Figma "1. Employees and proposed increment" table. The whole table is one form saved by
 * "Save draft" (all or nothing); a refused save keeps what was typed and marks the rows.
 */
export function ProposalsTable({
  formId,
  requestId,
  version,
  editable,
  rows,
  labels,
  messages,
  footer,
}: ProposalsTableProps) {
  const [state, formAction, pending] = useActionState(saveDraft, INITIAL);
  const texts = new Map(messages);
  const message = (key: string | undefined) =>
    key === undefined ? undefined : (texts.get(key) ?? key);

  return (
    <form id={formId} action={formAction} noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="version" value={version} />
      {/* Enter in a field submits with the form's first submit button: make that "Save draft",
          never a row's remove button. Hidden from assistive tech: the visible one is in the header. */}
      {editable ? (
        <Button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          {labels.save}
        </Button>
      ) : null}
      {state.error === undefined ? null : (
        <Alert role="alert" tone="danger" title={message(state.error)} className="mb-4" />
      )}
      <Table caption={labels.caption}>
        <THead>
          <Tr>
            <Th>{labels.colEmployee}</Th>
            <Th>{labels.colGrade}</Th>
            <Th>{labels.colCurrent}</Th>
            <Th>{labels.colProposedAs}</Th>
            <Th>{labels.colValue}</Th>
            <Th>{labels.colCriteria}</Th>
            {editable ? <Th className="sr-only">{labels.colActions}</Th> : null}
          </Tr>
        </THead>
        <TBody>
          {rows.map((row) => {
            const typed = state.rows.find((candidate) => candidate.lineId === row.lineId);
            const error = message(typed?.error);
            const errorId = `${row.lineId}-error`;
            // Remount after a refused save so the inputs start from what was typed (React resets
            // a form to its default values once its action finishes).
            const key = `${row.lineId}:${typed?.kind ?? ''}:${typed?.value ?? ''}`;
            return (
              <Tr key={row.lineId}>
                <Td>
                  <input type="hidden" name="lineId" value={row.lineId} />
                  <CellStack primary={row.fullName} secondary={row.employeeNumber} />
                </Td>
                <Td>{row.grade}</Td>
                <Td className="whitespace-nowrap font-semibold tabular-nums">{row.current}</Td>
                <Td>
                  {editable ? (
                    <SegmentedChoice
                      key={key}
                      name={`kind:${row.lineId}`}
                      legend={row.labels.proposedAs}
                      defaultValue={typed?.kind ?? row.kind}
                      size="md"
                      options={[
                        { value: 'percent', label: labels.percentOption },
                        { value: 'amount', label: row.currencyCode },
                      ]}
                    />
                  ) : (
                    <span>{row.kind === 'percent' ? labels.percentOption : row.currencyCode}</span>
                  )}
                </Td>
                <Td className="min-w-32">
                  {editable ? (
                    <div className="w-40">
                      <Input
                        key={key}
                        name={`value:${row.lineId}`}
                        aria-label={row.labels.value}
                        defaultValue={typed?.value ?? row.value}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={labels.valuePlaceholder}
                        aria-invalid={error !== undefined}
                        aria-describedby={error === undefined ? undefined : errorId}
                        controlSize="lg"
                        className="tabular-nums"
                      />
                      {error === undefined ? null : (
                        <p id={errorId} className="mt-1 w-56 text-xs font-medium text-danger-600">
                          {error}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="tabular-nums">{row.value}</span>
                  )}
                </Td>
                <Td>
                  <CriteriaProgress
                    results={row.criteria}
                    label={row.criteriaLabel}
                    stateLabels={labels.criterionStates}
                  />
                </Td>
                {editable ? (
                  <Td className="text-end">
                    <button
                      type="submit"
                      formAction={removeEmployeeAction.bind(null, row.lineId)}
                      aria-label={row.labels.remove}
                      title={row.labels.remove}
                      className={cn(
                        'inline-flex size-9 items-center justify-center rounded-control text-ink hover:bg-danger-50 hover:text-danger-600',
                        transition,
                        focusRing,
                      )}
                    >
                      <Icon name="trash" className="size-5" />
                    </button>
                  </Td>
                ) : null}
              </Tr>
            );
          })}
        </TBody>
      </Table>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        {footer}
        {pending ? (
          <span role="status" className="flex items-center gap-2 text-xs text-ink-muted">
            <Spinner />
            {labels.saving}
          </span>
        ) : null}
      </div>
    </form>
  );
}
