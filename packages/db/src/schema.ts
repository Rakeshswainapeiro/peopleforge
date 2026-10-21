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
  /** How the criterion passes (R1-05): the preparer's judgement, or a measured value. */
  pass_rule: PassRule;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface RequestSequenceTable {
  cycle_id: string;
  last_number: number;
}

export type RequestStatus =
  'draft' | 'submitted' | 'under_review' | 'returned' | 'approved' | 'partly_approved' | 'rejected';

/** Where an employee stands in Sirius HR's review (0009). */
export type LineReviewStatus = 'pending' | 'approved' | 'rejected' | 'returned';
export type LineDecisionValue = 'approved' | 'rejected' | 'returned';

export interface IncrementRequestTable {
  id: Generated<string>;
  reference: string;
  entity_id: string;
  cycle_id: string;
  criteria_set_id: string;
  status: Generated<RequestStatus>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  version: Generated<number>;
  deleted_at: Date | null;
  submitted_at: Date | null;
  submitted_by: string | null;
  /** The submitter's display name when they submitted (0007); null before then. */
  submitted_by_name: string | null;
  /** Last status change (Age, Last update on the dashboard); set by every status change. */
  status_changed_at: Generated<Date>;
  /** When the last employee was decided (0009); null until then. */
  decided_at: Date | null;
}

export type ProposedKind = 'percent' | 'amount';

export interface RequestLineTable {
  id: string;
  request_id: string;
  entity_id: string;
  employee_id: string;
  employee_number: string;
  full_name: string;
  grade: string;
  /** Snapshot of the employee's monthly salary when added; ciphertext (ADR-008). */
  current_salary: Buffer;
  currency: string;
  proposed_kind: ProposedKind | null;
  /** Ciphertext of a decimal string: a percentage or an amount, per proposed_kind. */
  proposed_value: Buffer | null;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  review_status: Generated<LineReviewStatus>;
  review_changed_at: Date | null;
  deleted_at: Date | null;
}

export type CriterionResultValue = 'pass' | 'fail';

/** A criterion's pass rule (R1-05), stored in `increments.criterion.pass_rule`. */
export type PassRule =
  | { kind: 'manual' }
  | {
      kind: 'threshold';
      operator: 'gte' | 'lte';
      /** Decimal string, e.g. "3.5". */
      value: string;
      unit: 'rating' | 'score' | 'percent' | 'months' | 'years' | 'days';
    };

export interface CriterionResultTable {
  id: string;
  line_id: string;
  entity_id: string;
  criterion_id: string;
  result: CriterionResultValue | null;
  /** Ciphertext of the justification text (ADR-008); null when empty. */
  justification: Buffer | null;
  /** Ciphertext of the measured value (decimal string) for a threshold criterion; null when none. */
  measured_value: Buffer | null;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface EvidenceFileTable {
  id: string;
  line_id: string;
  entity_id: string;
  criterion_id: string;
  object_key: string;
  file_name: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  scan_engine: string;
  scanned_at: Date;
  created_at: Timestamp;
  created_by: string;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface IdempotencyKeyTable {
  user_id: string;
  key: string;
  request_id: string;
  created_at: Timestamp;
}

export interface StatusEventTable {
  id: Generated<string>;
  request_id: string;
  entity_id: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  actor: string;
  at: Generated<Date>;
  reason: string | null;
}

export interface ReminderRuleTable {
  kind: string;
  days: number;
  enabled: boolean;
  recipient_role: string | null;
  updated_at: Generated<Date>;
  updated_by: string;
  updated_by_name: string | null;
}

export interface AuditLogTable {
  id: Generated<string>;
  at: Generated<Date>;
  actor: string;
  action: string;
  entity_id: string | null;
  subject_type: string;
  subject_id: string;
  details: ColumnType<Record<string, unknown>, string | undefined, never>;
  correlation_id: string | null;
  /** The actor's display name at the time, from the transaction (0011); null before 0011. */
  actor_name: ColumnType<string | null, never, never>;
}

export interface NotificationTable {
  id: Generated<string>;
  recipient_user_id: string | null;
  recipient_role: string | null;
  entity_id: string | null;
  request_id: string | null;
  kind: string;
  params: ColumnType<Record<string, string | number>, string, never>;
  action_needed: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface NotificationReadTable {
  notification_id: string;
  user_id: string;
  read_at: Generated<Date>;
}

export type EmailStatus = 'pending' | 'sent' | 'dead' | 'skipped';

export interface EmailOutboxTable {
  id: Generated<string>;
  notification_id: string;
  created_at: Generated<Date>;
  sent_at: Date | null;
  attempts: Generated<number>;
  /** A reason code (e.g. `smtp_550`), never server text. */
  last_error: string | null;
  status: Generated<EmailStatus>;
  next_attempt_at: Generated<Date>;
  message_id: string | null;
}

/** Where role-addressed notifications are emailed (0008, configuration). */
export interface RoleMailboxTable {
  role: string;
  address: string;
  updated_at: Generated<Date>;
  updated_by: string;
}

/** Web migration 0002: identity-provider account ID → work email, for the worker only. */
export interface RecipientEmailView {
  user_id: ColumnType<string, never, never>;
  email: ColumnType<string, never, never>;
}

export interface CriterionVerificationTable {
  line_id: string;
  entity_id: string;
  criterion_id: string;
  verified_by: string;
  verified_by_name: string;
  verified_at: Generated<Date>;
}

export interface LineDecisionTable {
  id: string;
  line_id: string;
  entity_id: string;
  request_id: string;
  decision: LineDecisionValue;
  reason_code: string | null;
  /** Ciphertext of the reviewer's comment (ADR-008). */
  comment: Buffer | null;
  approved_kind: ProposedKind | null;
  /** Ciphertext of a decimal: the approved percentage or amount when it differs from the proposal. */
  approved_value: Buffer | null;
  decided_by: string;
  decided_by_name: string;
  decided_at: Generated<Date>;
}

export type MessageSide = 'sirius' | 'subsidiary';

export interface LineMessageTable {
  id: string;
  line_id: string;
  entity_id: string;
  request_id: string;
  side: MessageSide;
  author_id: string;
  author_name: string;
  /** Ciphertext of the message (ADR-008). */
  body: Buffer;
  created_at: Generated<Date>;
}

/** Tables the application reads and writes, by schema-qualified name. */
export interface Database {
  'core.entity': EntityTable;
  'core.user_entity': UserEntityTable;
  'core.increment_cycle': IncrementCycleTable;
  'core.employee': EmployeeTable;
  'increments.criteria_set': CriteriaSetTable;
  'increments.criterion': CriterionTable;
  'increments.request_sequence': RequestSequenceTable;
  'increments.increment_request': IncrementRequestTable;
  'increments.request_line': RequestLineTable;
  'increments.idempotency_key': IdempotencyKeyTable;
  'increments.criterion_result': CriterionResultTable;
  'increments.evidence_file': EvidenceFileTable;
  'increments.status_event': StatusEventTable;
  'audit.audit_log': AuditLogTable;
  'notify.notification': NotificationTable;
  'notify.notification_read': NotificationReadTable;
  'notify.email_outbox': EmailOutboxTable;
  'notify.reminder_rule': ReminderRuleTable;
  'notify.role_mailbox': RoleMailboxTable;
  'increments.criterion_verification': CriterionVerificationTable;
  'increments.line_decision': LineDecisionTable;
  'increments.line_message': LineMessageTable;
  'auth.recipient_email': RecipientEmailView;
}
