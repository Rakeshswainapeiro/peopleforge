/**
 * Characters that make spreadsheet applications treat a cell as a formula (OWASP CSV
 * injection). Exported text from subsidiary uploads is untrusted, so every text cell written to
 * CSV/Excel (R1-14, R2-08) passes through this guard.
 */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Prefixes a single quote so the value is rendered as text. Apply to text cells only — write
 * numeric values as numeric cells, otherwise legitimate negatives would be altered.
 */
export function neutraliseFormula(value: string): string {
  const first = value.charAt(0);
  return FORMULA_TRIGGERS.has(first) ? `'${value}` : value;
}
