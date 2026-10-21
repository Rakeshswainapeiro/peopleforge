import type { Kysely, Transaction } from 'kysely';
import type { Database, LocalisedText, PassRule } from './schema.js';

export type EvidencePolicy = 'required' | 'optional' | 'none';

/** One criterion of the request's pinned set, with what it asks for (R1-03, R1-05). */
export interface CriterionRecord {
  id: string;
  code: string;
  name: LocalisedText;
  description: LocalisedText;
  justificationRequired: boolean;
  evidencePolicy: EvidencePolicy;
  allowedMediaTypes: string[];
  maxFileMb: number;
  /** Passes on a measured value (R1-05); null: Pass or Fail is the preparer's judgement. */
  threshold: Threshold | null;
}

export type Threshold = Omit<Extract<PassRule, { kind: 'threshold' }>, 'kind'>;

/** The threshold of a pass rule, or null for a manual one. */
export function thresholdOf(rule: PassRule): Threshold | null {
  if (rule.kind !== 'threshold') return null;
  return { operator: rule.operator, value: rule.value, unit: rule.unit };
}

/** The pass rule stored for a threshold, or a manual rule without one. */
export function passRuleOf(threshold: Threshold | null): PassRule {
  return threshold === null ? { kind: 'manual' } : { kind: 'threshold', ...threshold };
}

/** Criteria by set: `of` gives a set's criteria in display order (none for an unknown set). */
export interface CriteriaSets {
  of: (setId: string) => CriterionRecord[];
}

/**
 * Loads the criteria of the given sets. Requests pin the set active when they were created
 * (R1-05), so a page of requests may span several sets; each is loaded once, in one query.
 */
export async function loadCriteriaSets(
  trx: Kysely<Database> | Transaction<Database>,
  setIds: readonly string[],
): Promise<CriteriaSets> {
  const sets = new Map<string, CriterionRecord[]>();
  const unique = [...new Set(setIds)];
  const rows =
    unique.length === 0
      ? []
      : await trx
          .selectFrom('increments.criterion')
          .select([
            'id',
            'criteria_set_id',
            'code',
            'name',
            'description',
            'justification_required',
            'evidence_policy',
            'allowed_media_types',
            'max_file_mb',
            'pass_rule',
          ])
          .where('criteria_set_id', 'in', unique)
          .orderBy('criteria_set_id')
          .orderBy('position')
          .execute();
  for (const row of rows) {
    const list = sets.get(row.criteria_set_id) ?? [];
    list.push({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      justificationRequired: row.justification_required,
      evidencePolicy: row.evidence_policy,
      allowedMediaTypes: row.allowed_media_types,
      maxFileMb: row.max_file_mb,
      threshold: thresholdOf(row.pass_rule),
    });
    sets.set(row.criteria_set_id, list);
  }
  return { of: (setId) => sets.get(setId) ?? [] };
}
