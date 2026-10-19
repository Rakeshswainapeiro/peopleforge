'use client';

import {
  Alert,
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
import { removeEmployeeAction } from '@/app/(portal)/requests/actions';
import { useDraftForm } from './draft-form';

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
  /** With Sirius HR while the subsidiary fixes returned employees: shown, not changed. */
  locked: boolean;
  /** "With Sirius HR", shown in place of the actions of a locked row. */
  lockedLabel: string;
  labels: { proposedAs: string; value: string; remove: string; assess: string };
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
  saving: string;
}

export interface ProposalsTableProps {
  editable: boolean;
  /** Rows can be removed (a draft); not while fixing returned employees. */
  removable?: boolean;
  /** The employee whose criteria are open below the table. */
  selectedLineId?: string | undefined;
  rows: readonly ProposalRowView[];
  labels: ProposalsTableLabels;
  /** Translated texts for the error keys the save can return, as [key, text] pairs. */
  messages: readonly (readonly [string, string])[];
  /**
   * The totals under the table, as data rendered here: server-built markup passed into this
   * client list made React warn about keys in development (fixed 2026-10-19).
   */
  totals: readonly TotalItem[];
}

/** One figure under the table; `id` is also its test ID (e.g. `total-increase`). */
export interface TotalItem {
  id: string;
  label: string;
  value: string;
}

/**
 * Figma "1. Employees and proposed increment" table. Its fields belong to the page's draft
 * form (`DraftForm`), saved by "Save draft" all or nothing; a refused save keeps what was
 * typed and marks the rows. The pencil saves too, then opens that employee's criteria.
 */
export function ProposalsTable({
  editable,
  removable = true,
  selectedLineId,
  rows,
  labels,
  messages,
  totals,
}: ProposalsTableProps) {
  const { formId, state, pending } = useDraftForm();
  const texts = new Map(messages);
  const message = (key: string | undefined) =>
    key === undefined ? undefined : (texts.get(key) ?? key);

  return (
    <div>
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
            // A locked row posts nothing: only the rows that may change are saved.
            const changeable = editable && !row.locked;
            return (
              <Tr key={row.lineId} selected={row.lineId === selectedLineId}>
                <Td>
                  {changeable ? (
                    <input type="hidden" name="lineId" value={row.lineId} form={formId} />
                  ) : null}
                  <CellStack primary={row.fullName} secondary={row.employeeNumber} />
                </Td>
                <Td>{row.grade}</Td>
                <Td className="whitespace-nowrap font-semibold tabular-nums">{row.current}</Td>
                <Td>
                  {changeable ? (
                    <SegmentedChoice
                      key={key}
                      name={`kind:${row.lineId}`}
                      form={formId}
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
                  {changeable ? (
                    <div className="w-40">
                      <Input
                        key={key}
                        name={`value:${row.lineId}`}
                        form={formId}
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
                {editable && row.locked ? (
                  <Td className="text-end text-xs whitespace-nowrap text-ink-muted">
                    {row.lockedLabel}
                  </Td>
                ) : editable ? (
                  <Td className="whitespace-nowrap text-end">
                    {/* Saves the draft (nothing typed is lost), then opens this employee's
                        criteria: the action reads `selectLine`. */}
                    <button
                      type="submit"
                      form={formId}
                      name="selectLine"
                      value={row.lineId}
                      aria-label={row.labels.assess}
                      aria-current={row.lineId === selectedLineId || undefined}
                      title={row.labels.assess}
                      className={cn(
                        'inline-flex size-9 items-center justify-center rounded-control text-ink hover:bg-brand-50 hover:text-brand-600 aria-[current=true]:bg-brand-50 aria-[current=true]:text-brand-600',
                        transition,
                        focusRing,
                      )}
                    >
                      <Icon name="pencil" className="size-5" />
                    </button>
                    {removable ? (
                      <button
                        type="submit"
                        form={formId}
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
                    ) : null}
                  </Td>
                ) : null}
              </Tr>
            );
          })}
        </TBody>
      </Table>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {totals.map((item) => (
            <div key={item.id} className="flex gap-2">
              <dt className="text-ink-muted">{item.label}</dt>
              <dd className="font-semibold tabular-nums" data-testid={item.id}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
        {pending ? (
          <span role="status" className="flex items-center gap-2 text-xs text-ink-muted">
            <Spinner />
            {labels.saving}
          </span>
        ) : null}
      </div>
    </div>
  );
}
