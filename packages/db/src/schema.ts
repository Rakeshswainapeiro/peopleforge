import type { ColumnType, Generated } from 'kysely';

/** Localised label: English required, Arabic optional (i18n standard). */
export interface LocalisedText {
  en: string;
  ar?: string;
}

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface EntityTable {
  id: Generated<string>;
  code: string;
  name: LocalisedText;
  default_currency: string;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface UserEntityTable {
  user_id: string;
  entity_id: string;
  created_at: Timestamp;
  created_by: string;
}

export interface IncrementCycleTable {
  id: Generated<string>;
  name: LocalisedText;
  starts_on: ColumnType<Date, string, string>;
  ends_on: ColumnType<Date, string, string>;
  submission_deadline: ColumnType<Date | null, string | null, string | null>;
  status: 'planned' | 'open' | 'closed';
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  version: Generated<number>;
}

export interface EmployeeTable {
  id: Generated<string>;
  entity_id: string;
  employee_number: string;
  full_name: string;
  grade: string;
  /** AES-256-GCM ciphertext of a decimal string (ADR-008). */
  monthly_salary: Buffer;
  currency: string;
  active: Generated<boolean>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface CriteriaSetTable {
  id: Generated<string>;
  version: number;
  status: 'draft' | 'active' | 'retired';
  activated_at: Date | null;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface CriterionTable {
  id: Generated<string>;
  criteria_set_id: string;
  position: number;
  code: string;
  name: LocalisedText;
  description: LocalisedText;
  justification_required: boolean;
  evidence_policy: 'required' | 'optional' | 'none';
  allowed_media_types: string[];
  max_file_mb: number;
  pass_rule: { kind: 'manual' } | Record<string, unknown>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

/** Tables the application reads and writes, by schema-qualified name. */
export interface Database {
  'core.entity': EntityTable;
  'core.user_entity': UserEntityTable;
  'core.increment_cycle': IncrementCycleTable;
  'core.employee': EmployeeTable;
  'increments.criteria_set': CriteriaSetTable;
  'increments.criterion': CriterionTable;
}
