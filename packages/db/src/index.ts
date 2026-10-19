export { recordAudit, type AuditEntry } from './audit.js';
export {
  createDashboardRepository,
  type CriterionFacts,
  type DashboardFilter,
  type DashboardLineRecord,
  type DashboardOrder,
  type DashboardRepository,
  type DashboardRequestRecord,
  type DashboardSummaryRecord,
} from './dashboard.js';
export {
  createEmailOutbox,
  reasonCode,
  type EmailOutbox,
  type OutboxJob,
  type OutboxOutcome,
  type OutboxRecipient,
  type OutboxStats,
} from './email-outbox.js';
export { createDatabase, type DatabaseHandle, type DatabaseOptions } from './database.js';
export { createEntityDirectory, type EntityDirectory, type EntitySummary } from './directory.js';
export {
  createFieldCipher,
  FieldCryptoError,
  parseKeyRing,
  type FieldCipher,
  type FieldContext,
  type KeyRing,
} from './field-crypto.js';
export {
  createIncrementRequestRepository,
  RequestDataError,
  type CriterionAssessmentRecord,
  type CriterionInput,
  type CriterionRecord,
  type CycleRecord,
  type DraftChanges,
  type EvidenceLocation,
  type EvidencePolicy,
  type EvidenceRecord,
  type NewEvidence,
  type EmployeeOption,
  type IncrementRequestRecord,
  type IncrementRequestRepository,
  type LineDecisionRecord,
  type VerificationRecord,
  type Proposal,
  type RequestDataErrorReason,
  type RequestLineRecord,
} from './increment-requests.js';
export {
  createNotificationRepository,
  insertNotifications,
  type NewNotification,
  type NotificationQuery,
  type NotificationRecord,
  type NotificationRepository,
  type Recipient,
} from './notifications.js';
export {
  DEFAULT_WORKER_ROLE,
  listMigrations,
  MigrationError,
  runMigrations,
  type MigrationCommand,
  type MigrationOptions,
} from './migrator.js';
export type {
  CriterionResultValue,
  Database,
  EmailStatus,
  LineDecisionValue,
  LineReviewStatus,
  LocalisedText,
  ProposedKind,
  RequestStatus,
} from './schema.js';
export {
  createReviewRepository,
  IN_REVIEW,
  statusFromLines,
  type DecisionContext,
  type DecisionInput,
  type QueueCounts,
  type QueueFilter,
  type QueueLineRecord,
  type QueueQuery,
  type ResubmitContext,
  type ReviewRepository,
  type StageContext,
} from './review.js';
export { ScopeError, withScope, type Scope } from './scope.js';
export {
  SEED_ASSIGNMENTS,
  SEED_ENTITIES,
  SEED_ROLE_MAILBOXES,
  SeedRefusedError,
  seedDevelopmentData,
} from './seed.js';
export {
  createConversationRepository,
  preview,
  PREVIEW_LENGTH,
  type ConversationRepository,
  type MessageContext,
  type MessageRecord,
  type PostMessageInput,
  type ThreadFilter,
  type ThreadQuery,
  type ThreadRecord,
} from './conversations.js';
export type { MessageSide } from './schema.js';
export {
  createAuditTrailRepository,
  HISTORY_LIMIT,
  type AuditEventRecord,
  type AuditTrailRepository,
  type TrailQuery,
} from './audit-trail.js';
export {
  createReportRepository,
  REPORT_ROW_LIMIT,
  type ReportDownload,
  type ReportLineRecord,
  type ReportRepository,
} from './reports.js';
export {
  createSettingsRepository,
  queueGroupReminders,
  queueReminders,
  REMINDER_KINDS,
  SettingsDataError,
  type ActiveCriteriaRecord,
  type CriterionEdit,
  type ReminderKind,
  type ReminderRuleRecord,
  type SettingsErrorReason,
  type SettingsRepository,
} from './settings.js';
export {
  createAnalyticsRepository,
  type AnalyticsFacts,
  type AnalyticsFilter,
  type AnalyticsRepository,
  type AnalyticsRequestFact,
  type MessageFact,
  type ReturnFact,
  type VerificationFact,
} from './analytics.js';
export {
  createGroupDataRepository,
  GroupDataError,
  MAX_STORED_ISSUES,
  only,
  type AcceptContext,
  type AcceptInput,
  type EmployeeQueryInput,
  type ExtractRow,
  type FileInput,
  type FlagInput,
  type GradeBandRecord,
  type GroupDataErrorReason,
  type GroupDataRepository,
  type SnapshotInput,
  type SnapshotRecord,
  type SummaryRow,
  type TemplateFieldRecord,
  type TemplateRecord,
  type UploadInput,
  type UploadIssueRecord,
  type UploadRecord,
} from './group-data.js';
export {
  loadApprovedIncrements,
  type ApprovedIncrementFilter,
  type ApprovedIncrementRecord,
} from './approved-increments.js';
export {
  createDataQualityRepository,
  DataQualityError,
  type DataQualityErrorReason,
  type DataQualityRepository,
  type FlagActivity,
  type FlagContext,
  type FlagFilter,
  type FlagRecord,
  type FlagStatus,
  type RuleRecord,
  type VariationRecord,
} from './data-quality.js';
