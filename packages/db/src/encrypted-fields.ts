/**
 * The encrypted columns (ADR-008). Each value is bound to its table, column and row id, so a
 * ciphertext copied to another row or column won't decrypt.
 */
export const SALARY = { table: 'increments.request_line', column: 'current_salary' } as const;
export const PROPOSED = { table: 'increments.request_line', column: 'proposed_value' } as const;
export const JUSTIFICATION = {
  table: 'increments.criterion_result',
  column: 'justification',
} as const;
export const DECISION_COMMENT = { table: 'increments.line_decision', column: 'comment' } as const;
export const APPROVED_VALUE = {
  table: 'increments.line_decision',
  column: 'approved_value',
} as const;
