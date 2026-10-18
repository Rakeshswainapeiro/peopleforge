# Schemas `core`, `increments`, `audit` and `notify` (slices S1–S5b)

Migrations: `packages/db/migrations/core/0001_core_schema`, `0002_placeholder_configuration`, `0003_increment_requests`, `0004_criteria_evidence`, `0005_submission_audit_notifications`, `0006_dashboard`, `0007_submitter_name`, `0008_email_worker`, `0009_review_decisions`, `0010_conversations` (up/down), recorded in `migrations.core`. Decisions: ADR-002 (data access, RLS), ADR-008 (field encryption), ADR-010 (evidence files), ADR-011 (audit trail and notifications), ADR-013 (review, decisions and returns). Design: `docs/design/r1-increment-portal.md` §3a.

Every table here also carries `created_at`, `created_by`, `updated_at`, `updated_by` (UTC timestamps, user IDs), and `version` (optimistic locking) where rows are edited. `created_by`/`updated_by` is `seed` for migration and seed rows.

## ERD

```mermaid
erDiagram
  ENTITY ||--o{ USER_ENTITY : "assigned to"
  ENTITY ||--o{ EMPLOYEE : employs
  CRITERIA_SET ||--|{ CRITERION : contains
  INCREMENT_CYCLE ||--o{ INCREMENT_REQUEST : "raised in"
  ENTITY ||--o{ INCREMENT_REQUEST : raises
  CRITERIA_SET ||--o{ INCREMENT_REQUEST : "pinned by"
  INCREMENT_REQUEST ||--o{ REQUEST_LINE : contains
  EMPLOYEE ||--o{ REQUEST_LINE : "proposed in"
  INCREMENT_REQUEST ||--o{ IDEMPOTENCY_KEY : "created by"
  INCREMENT_CYCLE ||--|| REQUEST_SEQUENCE : numbers
  REQUEST_LINE ||--o{ CRITERION_RESULT : "assessed by"
  CRITERION ||--o{ CRITERION_RESULT : "applied in"
  REQUEST_LINE ||--o{ EVIDENCE_FILE : "evidenced by"
  CRITERION ||--o{ EVIDENCE_FILE : "supports"
  INCREMENT_REQUEST ||--o{ STATUS_EVENT : "history"
  INCREMENT_REQUEST ||--o{ NOTIFICATION : "about"
  NOTIFICATION ||--o{ NOTIFICATION_READ : "read by"
  NOTIFICATION ||--o| EMAIL_OUTBOX : "emailed as"
  REQUEST_LINE ||--o{ CRITERION_VERIFICATION : "checked by Sirius HR"
  CRITERION ||--o{ CRITERION_VERIFICATION : "verified in"
  REQUEST_LINE ||--o{ LINE_DECISION : "decided by"
  REQUEST_LINE ||--o{ LINE_MESSAGE : "discussed in"
  ENTITY { uuid id PK; text code UK; jsonb name; char3 default_currency }
  USER_ENTITY { text user_id PK; uuid entity_id PK,FK }
  EMPLOYEE { uuid id PK; uuid entity_id FK; text employee_number; text full_name; text grade; bytea monthly_salary; char3 currency }
  INCREMENT_CYCLE { uuid id PK; jsonb name; date starts_on; date ends_on; date submission_deadline; text status }
  CRITERIA_SET { uuid id PK; int version UK; text status }
  CRITERION { uuid id PK; uuid criteria_set_id FK; smallint position; text code; jsonb name; jsonb description; text evidence_policy }
  INCREMENT_REQUEST { uuid id PK; text reference UK; uuid entity_id FK; uuid cycle_id FK; uuid criteria_set_id FK; text status; int version; timestamptz submitted_at; text submitted_by; timestamptz status_changed_at; timestamptz decided_at }
  REQUEST_LINE { uuid id PK; uuid request_id FK; uuid entity_id FK; uuid employee_id FK; text grade; bytea current_salary; char3 currency; text proposed_kind; bytea proposed_value; text review_status; timestamptz review_changed_at }
  CRITERION_VERIFICATION { uuid line_id PK,FK; uuid criterion_id PK,FK; uuid entity_id FK; text verified_by; text verified_by_name; timestamptz verified_at }
  LINE_MESSAGE { uuid id PK; uuid line_id FK; uuid request_id FK; uuid entity_id FK; text side; text author_id; text author_name; bytea body; timestamptz created_at }
  LINE_DECISION { uuid id PK; uuid line_id FK; uuid request_id FK; uuid entity_id FK; text decision; text reason_code; bytea comment; text approved_kind; bytea approved_value; text decided_by; text decided_by_name; timestamptz decided_at }
  IDEMPOTENCY_KEY { text user_id PK; text key PK; uuid request_id FK }
  REQUEST_SEQUENCE { uuid cycle_id PK; int last_number }
  CRITERION_RESULT { uuid id PK; uuid line_id FK; uuid entity_id FK; uuid criterion_id FK; text result; bytea justification }
  EVIDENCE_FILE { uuid id PK; uuid line_id FK; uuid entity_id FK; uuid criterion_id FK; text object_key UK; text file_name; text media_type; int size_bytes; char64 sha256; text scan_engine }
  STATUS_EVENT { uuid id PK; uuid request_id FK; uuid entity_id FK; text from_status; text to_status; text actor; timestamptz at }
  AUDIT_LOG { bigint id PK; timestamptz at; text actor; text action; uuid entity_id; text subject_type; text subject_id; jsonb details }
  NOTIFICATION { uuid id PK; text recipient_user_id; text recipient_role; uuid entity_id FK; uuid request_id FK; text kind; jsonb params; bool action_needed }
  NOTIFICATION_READ { uuid notification_id PK,FK; text user_id PK; timestamptz read_at }
  EMAIL_OUTBOX { uuid id PK; uuid notification_id FK; timestamptz sent_at; int attempts }
```

## Data dictionary

Sensitivity: **Public** (no harm if disclosed), **Internal**, **Confidential** (personal data), **Restricted** (pay; encrypted).

### `core.entity` — subsidiaries (R1-01, R2-12)

| Column             | Type          | Null | Meaning                                                 | Sensitivity |
| ------------------ | ------------- | ---- | ------------------------------------------------------- | ----------- |
| `id`               | `uuid`        | No   | Primary key                                             | Internal    |
| `code`             | `text`        | No   | Short unique code, `^[A-Z0-9][A-Z0-9_-]{1,19}$`         | Internal    |
| `name`             | `jsonb`       | No   | Localised name `{"en": …, "ar": …}`; `en` required      | Internal    |
| `default_currency` | `char(3)`     | No   | ISO 4217 code used when an amount has no other currency | Internal    |
| `deleted_at`       | `timestamptz` | Yes  | Soft delete                                             | Internal    |

### `core.user_entity` — who acts for which subsidiary (ADR-002 §4)

| Column      | Type   | Null | Meaning                                                | Sensitivity |
| ----------- | ------ | ---- | ------------------------------------------------------ | ----------- |
| `user_id`   | `text` | No   | Identity-provider object ID (Entra `oid`), 1–128 chars | Internal    |
| `entity_id` | `uuid` | No   | → `core.entity`                                        | Internal    |

Primary key `(user_id, entity_id)`. Rows are inserted and deleted, never updated (an assignment either exists or it doesn't). Sirius roles need no rows.

### `core.increment_cycle` — configuration (Q1: requests belong to a cycle)

| Column                | Type    | Null | Meaning                                       | Sensitivity |
| --------------------- | ------- | ---- | --------------------------------------------- | ----------- |
| `id`                  | `uuid`  | No   | Primary key                                   | Internal    |
| `name`                | `jsonb` | No   | Localised name; `en` required                 | Internal    |
| `starts_on`/`ends_on` | `date`  | No   | Cycle period; `ends_on ≥ starts_on`           | Internal    |
| `submission_deadline` | `date`  | Yes  | Last day to submit; within the period (R1-13) | Internal    |
| `status`              | `text`  | No   | `planned`, `open`, `closed`                   | Internal    |

### `core.employee` — interim employee directory (Q2 assumption, until R2 records replace it)

| Column            | Type          | Null | Meaning                                                                                        | Sensitivity    |
| ----------------- | ------------- | ---- | ---------------------------------------------------------------------------------------------- | -------------- |
| `id`              | `uuid`        | No   | Primary key; part of the salary's associated data                                              | Internal       |
| `entity_id`       | `uuid`        | No   | → `core.entity`; drives RLS                                                                    | Internal       |
| `employee_number` | `text`        | No   | Subsidiary's employee number, unique per entity among live rows                                | Confidential   |
| `full_name`       | `text`        | No   | Full name, NFC-normalised Unicode (Arabic supported)                                           | Confidential   |
| `grade`           | `text`        | No   | Grade label                                                                                    | Confidential   |
| `monthly_salary`  | `bytea`       | No   | AES-256-GCM ciphertext of the decimal string, AD `core.employee:monthly_salary:<id>` (ADR-008) | **Restricted** |
| `currency`        | `char(3)`     | No   | ISO 4217 code of the salary (plain)                                                            | Internal       |
| `active`          | `boolean`     | No   | Still employed                                                                                 | Confidential   |
| `deleted_at`      | `timestamptz` | Yes  | Soft delete                                                                                    | Internal       |

### `increments.criteria_set` / `increments.criterion` — eligibility criteria (R1-05, NFR-CFG-01)

| Column (criterion)       | Type       | Null | Meaning                                                            |
| ------------------------ | ---------- | ---- | ------------------------------------------------------------------ |
| `criteria_set_id`        | `uuid`     | No   | → `criteria_set`; a request pins the set active when it is created |
| `position`               | `smallint` | No   | Display order 1–10, unique per set                                 |
| `code`                   | `text`     | No   | `C1`…`C10`, unique per set                                         |
| `name`, `description`    | `jsonb`    | No   | Localised; `en` required                                           |
| `justification_required` | `boolean`  | No   | Text justification needed per employee                             |
| `evidence_policy`        | `text`     | No   | `required`, `optional`, `none` (R1-04)                             |
| `allowed_media_types`    | `text[]`   | No   | Evidence types allowed (checked by magic bytes, not extension)     |
| `max_file_mb`            | `integer`  | No   | 1–50                                                               |
| `pass_rule`              | `jsonb`    | No   | How "pass" is decided; `{"kind":"manual"}` until A1 defines rules  |

`criteria_set.status` is `draft`, `active` or `retired`; a partial unique index allows one `active` set. All values are Internal. **Migration `0002` seeds placeholder set v1 with C1–C5 named `[Placeholder]`** (C5 evidence optional) and "Increment cycle 2026" (open, deadline 2026-11-30). They are replaced through configuration once Sirius provides A1.

### `increments.increment_request` — a subsidiary's request in a cycle (R1-02)

| Column              | Type          | Null | Meaning                                                                                                                                     | Sensitivity  |
| ------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `id`                | `uuid`        | No   | Primary key (chosen by the API before insert)                                                                                               | Internal     |
| `reference`         | `text`        | No   | `INC-<cycle start year>-<NNNN>`, unique; numbered per cycle                                                                                 | Internal     |
| `entity_id`         | `uuid`        | No   | → `core.entity`; drives RLS                                                                                                                 | Internal     |
| `cycle_id`          | `uuid`        | No   | → `core.increment_cycle` (must be `open` at creation)                                                                                       | Internal     |
| `criteria_set_id`   | `uuid`        | No   | The criteria set active at creation; later changes don't affect it (R1-05)                                                                  | Internal     |
| `status`            | `text`        | No   | `draft`, `submitted`, `under_review`, `returned`, `approved`, `partly_approved` or `rejected` (0009; rules below)                           | Internal     |
| `decided_at`        | `timestamptz` | Yes  | When the last employee was decided: set exactly when the status is final (CHECK). The end of the request's TAT (R1-11) (0009)               | Internal     |
| `submitted_at`      | `timestamptz` | Yes  | When it was submitted; set exactly when `status` isn't `draft` (CHECK)                                                                      | Internal     |
| `submitted_by`      | `text`        | Yes  | User ID of the submitter; set with `submitted_at`                                                                                           | Internal     |
| `submitted_by_name` | `text`        | Yes  | The submitter's display name as read at submit time ("by Priya Nair"), 1–200 characters; null for drafts and requests submitted before 0007 | Confidential |
| `status_changed_at` | `timestamptz` | No   | Last status change (creation for a draft); the dashboard's Age and Last update (0006, backfilled from `submitted_at` or `created_at`)       | Internal     |
| `version`           | `integer`     | No   | Bumped by every change; a save with a stale version is refused (409)                                                                        | Internal     |
| `deleted_at`        | `timestamptz` | Yes  | Soft delete                                                                                                                                 | Internal     |

`submitted_by_name` is kept so the request page can say who submitted it without a user directory lookup (Phase 1 has no user profile table; the IdP holds names). It is a staff member's name, so Confidential, and goes with the request under its retention.

**Statuses (ADR-013).** `submitted` until Sirius HR's first verification or decision → `under_review`. While any employee is `returned` the request is `returned` (with the subsidiary). Once every employee is decided it is final: `approved` (all approved), `rejected` (all rejected) or `partly_approved` (some of each). Every change is a `status_event` and an audit entry.

Unique `(id, entity_id)` exists so lines can reference the pair. A submitted request is read-only for the subsidiary, except for its returned employees (below): every change (lines, proposals, criteria, evidence) locks the request and refuses a non-draft (`not_draft`, 409). Submitting is idempotent per user and key (the `idempotency_key` table is reused).

### `increments.request_line` — an employee in a request

| Column                                  | Type          | Null | Meaning                                                                                          | Sensitivity    |
| --------------------------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------------ | -------------- |
| `request_id`, `entity_id`               | `uuid`        | No   | → `increment_request (id, entity_id)`: a line can't sit in another subsidiary's request          | Internal       |
| `employee_id`, `entity_id`              | `uuid`        | No   | → `core.employee (id, entity_id)`: the employee must belong to the same subsidiary               | Internal       |
| `employee_number`, `full_name`, `grade` | `text`        | No   | Snapshot when added (Q2 decision): later directory changes don't rewrite the request             | Confidential   |
| `current_salary`                        | `bytea`       | No   | Snapshot of monthly salary; AES-256-GCM, AD `increments.request_line:current_salary:<id>`        | **Restricted** |
| `currency`                              | `char(3)`     | No   | ISO 4217 of the salary and of an amount proposal                                                 | Internal       |
| `proposed_kind`                         | `text`        | Yes  | `percent` or `amount`; null until proposed                                                       | Confidential   |
| `proposed_value`                        | `bytea`       | Yes  | Encrypted decimal (percentage or monthly amount), AD `…:proposed_value:<id>`; null with the kind | **Restricted** |
| `created_at`                            | `timestamptz` | No   | `clock_timestamp()`: keeps the order employees were added within one transaction                 | Internal       |
| `deleted_at`                            | `timestamptz` | Yes  | Soft delete (removing an employee); the same employee may be added again                         | Internal       |
| `review_status`                         | `text`        | No   | `pending` (with Sirius HR), `approved`, `rejected` or `returned` (with the subsidiary) (0009)    | Confidential   |
| `review_changed_at`                     | `timestamptz` | Yes  | When `review_status` last changed (null until then): the queue's "waiting since" (0009)          | Internal       |

A returned employee is the only part of a submitted request the subsidiary can change: its proposal, criteria and evidence (the repository's `lockDraft` allows a `returned` request only for lines whose `review_status` is `returned`). Resubmitting sets them back to `pending` and deletes their verifications, so Sirius HR checks them again.

Derived values (increase, new salary, percentage, totals) are computed by the API on read with decimal arithmetic and are **not stored** (no stale copies). Rules: `apps/api/src/modules/increment-requests/money.ts`.

Unique `(id, entity_id)` (`request_line_id_entity_key`, migration 0004) exists so criterion results and evidence can reference the pair.

### `increments.criterion_result` — an employee's result on one criterion (R1-03, R1-06)

| Column                 | Type    | Null | Meaning                                                                                                                                                                                                       | Sensitivity    |
| ---------------------- | ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `id`                   | `uuid`  | No   | Primary key (chosen by the API: part of the justification's associated data); kept when the result is updated                                                                                                 | Internal       |
| `line_id`, `entity_id` | `uuid`  | No   | → `request_line (id, entity_id)`: a result can't sit in another subsidiary                                                                                                                                    | Internal       |
| `criterion_id`         | `uuid`  | No   | → `criterion`; the API accepts only criteria of the request's pinned set                                                                                                                                      | Internal       |
| `result`               | `text`  | Yes  | `pass` or `fail`; null until chosen                                                                                                                                                                           | Confidential   |
| `justification`        | `bytea` | Yes  | AES-256-GCM ciphertext of the text (≤ 2,000 characters, NFC), AD `increments.criterion_result:justification:<id>`; null when empty. Encrypted because it can describe appraisals, disciplinary records or pay | **Restricted** |

Unique `(line_id, criterion_id)`: one row per employee and criterion, created on the first save and updated in place (history arrives with the audit trail, R1-15). Saved together with the proposals by "Save draft", under the request's version check. Whether a criterion is complete is derived on read (`apps/api/src/modules/increment-requests/criteria.ts`): a result, a justification when the criterion requires one, and at least one live file when its evidence policy is `required` — the same for Pass and Fail.

### `increments.evidence_file` — a file supporting one criterion for one employee (R1-04, ADR-010)

| Column                    | Type                 | Null | Meaning                                                                                       | Sensitivity  |
| ------------------------- | -------------------- | ---- | --------------------------------------------------------------------------------------------- | ------------ |
| `id`                      | `uuid`               | No   | Primary key, chosen by the API; also the last part of the object key                          | Internal     |
| `line_id`, `entity_id`    | `uuid`               | No   | → `request_line (id, entity_id)`                                                              | Internal     |
| `criterion_id`            | `uuid`               | No   | → `criterion`                                                                                 | Internal     |
| `object_key`              | `text`               | No   | Unique; `evidence/<entity-id>/<file-id>` (checked by regex): server-generated, never the name | Internal     |
| `file_name`               | `text`               | No   | Display name, sanitised (no path, controls or quotes), 1–150 characters, NFC                  | Confidential |
| `media_type`              | `text`               | No   | Detected from the content (magic bytes) and in the criterion's allow-list                     | Internal     |
| `size_bytes`              | `integer`            | No   | 1 B – 50 MB (the API accepts ≤ 10 MB)                                                         | Internal     |
| `sha256`                  | `char(64)`           | No   | Hex digest of the content (integrity, duplicate detection later)                              | Internal     |
| `scan_engine`             | `text`               | No   | `clamav` (or `none` in local development only)                                                | Internal     |
| `scanned_at`              | `timestamptz`        | No   | When the clean scan finished; infected files are never recorded                               | Internal     |
| `deleted_at`/`deleted_by` | `timestamptz`/`text` | Yes  | Soft delete (both or neither); the object stays in storage until retention (Q10)              | Internal     |

The file itself is in the private bucket (**Restricted**: personal documents), encrypted at rest by the store. At most 5 live files per employee and criterion, counted under the request's row lock. Adding or removing a file doesn't change the request's `version`, so a form being edited isn't invalidated.

### `increments.status_event` — status history (R1-07; basis of TAT and back-and-forth, R1-11, R1-12)

| Column                    | Type          | Null | Meaning                                                             | Sensitivity  |
| ------------------------- | ------------- | ---- | ------------------------------------------------------------------- | ------------ |
| `id`                      | `uuid`        | No   | Primary key                                                         | Internal     |
| `request_id`, `entity_id` | `uuid`        | No   | → `increment_request (id, entity_id)`                               | Internal     |
| `from_status`             | `text`        | Yes  | Status before; null for the first event                             | Internal     |
| `to_status`               | `text`        | No   | Status after                                                        | Internal     |
| `actor`                   | `text`        | No   | User ID                                                             | Internal     |
| `at`                      | `timestamptz` | No   | `clock_timestamp()`, UTC                                            | Internal     |
| `reason`                  | `text`        | Yes  | ≤ 2,000 characters; used for returns and rejections (S5), else null | Confidential |

**Append-only**: the app role has `SELECT, INSERT` only, and the trigger `status_event_append_only` (`audit.refuse_change()`) refuses `UPDATE`, `DELETE` and `TRUNCATE` for every role, the owner included.

### `increments.criterion_verification` — Sirius HR's check of one criterion (R1-07, R1-10, 0009)

| Column                 | Type          | Null | Meaning                                                                                 | Sensitivity  |
| ---------------------- | ------------- | ---- | --------------------------------------------------------------------------------------- | ------------ |
| `line_id`, `entity_id` | `uuid`        | No   | → `request_line (id, entity_id)`                                                        | Internal     |
| `criterion_id`         | `uuid`        | No   | → `criterion`; part of the primary key `(line_id, criterion_id)`                        | Internal     |
| `verified_by`          | `text`        | No   | Reviewer's user ID                                                                      | Internal     |
| `verified_by_name`     | `text`        | No   | Reviewer's display name at the time ("Verified by Sara, 16 Oct"), 1–200 characters      | Confidential |
| `verified_at`          | `timestamptz` | No   | `clock_timestamp()`, UTC: the end of this criterion's TAT for this employee (R1-11, S7) | Internal     |

"Mark verified" inserts a row; "Undo" deletes it; both are audited (`criterion.verified`, `criterion.unverified`). Resubmitting a returned employee deletes theirs. A request's **stage** is the number of criteria verified for every `pending` employee, plus one (criteria in any order; ADR-013).

### `increments.line_decision` — every decision on an employee (R1-08, R1-09, 0009)

| Column                               | Type           | Null | Meaning                                                                                                                             | Sensitivity    |
| ------------------------------------ | -------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `id`                                 | `uuid`         | No   | Primary key, chosen by the API (part of the ciphertexts' associated data)                                                           | Internal       |
| `line_id`, `request_id`, `entity_id` | `uuid`         | No   | → `request_line` and `increment_request`, both with the entity                                                                      | Internal       |
| `decision`                           | `text`         | No   | `approved`, `rejected` or `returned`                                                                                                | Confidential   |
| `reason_code`                        | `text`         | Yes  | From the contract's list for the decision (`criteria_not_met`, `missing_evidence`, `budget`…); required unless approved as proposed | Confidential   |
| `comment`                            | `bytea`        | Yes  | Reviewer's comment or question, AES-256-GCM, AD `increments.line_decision:comment:<id>`; null when none                             | **Restricted** |
| `approved_kind`, `approved_value`    | `text`/`bytea` | Yes  | An approval at another increment: kind and encrypted decimal (AD `…:approved_value:<id>`); both null = as proposed                  | **Restricted** |
| `decided_by`, `decided_by_name`      | `text`         | No   | Reviewer's user ID and display name at the time                                                                                     | Confidential   |
| `decided_at`                         | `timestamptz`  | No   | `clock_timestamp()`, UTC                                                                                                            | Internal       |

The latest row per employee is the current decision; earlier ones stay (a returned employee is later approved or rejected): this is the back-and-forth record for R1-12. **Append-only**: `SELECT, INSERT` for the app role and the `line_decision_append_only` trigger. Comments are encrypted because they can discuss appraisals and pay.

### `increments.line_message` — questions and answers per employee (R1-08, 0010)

| Column                               | Type          | Null | Meaning                                                                                    | Sensitivity    |
| ------------------------------------ | ------------- | ---- | ------------------------------------------------------------------------------------------ | -------------- |
| `id`                                 | `uuid`        | No   | Primary key, chosen by the API (part of the body's associated data)                        | Internal       |
| `line_id`, `request_id`, `entity_id` | `uuid`        | No   | → `request_line` and `increment_request`, both with the entity                             | Internal       |
| `side`                               | `text`        | No   | `sirius` (a reviewer asked) or `subsidiary` (the subsidiary's HR answered)                 | Internal       |
| `author_id`, `author_name`           | `text`        | No   | Writer's user ID and display name at the time (1–200 characters)                           | Confidential   |
| `body`                               | `bytea`       | No   | The message (≤ 2,000 characters, NFC), AES-256-GCM, AD `increments.line_message:body:<id>` | **Restricted** |
| `created_at`                         | `timestamptz` | No   | `clock_timestamp()`, UTC                                                                   | Internal       |

A thread is one employee's messages; whoever didn't write the latest one has to answer (the Conversations page's "Waiting for you"). Posting is allowed while the request is in review (`submitted`, `under_review`, `returned`), never on a draft or a decided request; it is audited (`message.posted`, without the text) and notifies the other side with action needed. **Append-only** (`line_message_append_only` trigger; `SELECT, INSERT` for the app role): a conversation is a record of what was asked.

### `audit.audit_log` — audit trail (R1-15, R2-13, NFR-AUD-01, ADR-011)

| Column           | Type          | Null | Meaning                                                                                                    | Sensitivity |
| ---------------- | ------------- | ---- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| `id`             | `bigint`      | No   | Identity, increasing                                                                                       | Internal    |
| `at`             | `timestamptz` | No   | `clock_timestamp()`, UTC                                                                                   | Internal    |
| `actor`          | `text`        | No   | User ID; must equal the session user (RLS)                                                                 | Internal    |
| `actor_name`     | `text`        | Yes  | The actor's display name at the time (≤ 200), from `app.user_name`; null for rows before 0011              | Personal    |
| `action`         | `text`        | No   | Dotted verb `^[a-z_]+\.[a-z_]+$`, e.g. `increment_request.submitted`, `evidence.downloaded`                | Internal    |
| `entity_id`      | `uuid`        | Yes  | Subsidiary concerned; must be one the actor can access                                                     | Internal    |
| `subject_type`   | `text`        | No   | `increment_request`, `request_line`, `evidence_file`, …                                                    | Internal    |
| `subject_id`     | `text`        | No   | ID of the subject                                                                                          | Internal    |
| `details`        | `jsonb`       | No   | What changed (e.g. version, employee count, criterion ID). **Never** salaries, justifications or file data | Internal    |
| `correlation_id` | `text`        | Yes  | Request ID, to join with logs                                                                              | Internal    |

Actions recorded: `increment_request.created`, `.draft_saved`, `.submitted`, `.discarded`, `.status_changed`, `.resubmitted`; `request_line.added`, `.removed`, `.approved`, `.rejected`, `.returned`; `criterion.verified`, `.unverified`; `evidence.uploaded`, `.removed`, `.downloaded`; `message.posted` (never the text); `report.downloaded` (S6: subject `report`/`RP-01`, details format, row count and filters — never the rows). Each is written in the same transaction as the change (downloads: before the file is streamed). Append-only like `status_event`.

**0011 (S6):** `actor_name` is filled by a column default from the session setting `app.user_name` (set by `withScope` from the signed-in user's name), so every writer records it without code changes; the name is kept as it was then, which an audit needs. Reading: group scope reads everything (`audit:read` in the API); **entity scope now reads its own subsidiary's rows** (`audit_read_entity`), so a request's History works for the subsidiary — the API shows it only to callers who can see the request. The Audit trail page (`GET /audit`) stays `audit:read`.

### `notify.notification`, `notify.notification_read`, `notify.email_outbox` — notifications (R1-07, R1-13)

| Column (notification) | Type          | Null | Meaning                                                                                                                   | Sensitivity  |
| --------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `id`                  | `uuid`        | No   | Primary key, chosen by the API (an `INSERT … RETURNING` would be checked against the read policy)                         | Internal     |
| `recipient_user_id`   | `text`        | Yes  | One user — or                                                                                                             | Internal     |
| `recipient_role`      | `text`        | Yes  | everyone holding a role, e.g. `sirius_hr_reviewer` (Sirius users aren't stored; roles come from the IdP). Exactly one set | Internal     |
| `entity_id`           | `uuid`        | Yes  | → `core.entity`                                                                                                           | Internal     |
| `request_id`          | `uuid`        | Yes  | → `increment_request`; where "View" leads                                                                                 | Internal     |
| `kind`                | `text`        | No   | What happened, e.g. `request_submitted`; the text is worded per locale by the client                                      | Internal     |
| `params`              | `jsonb`       | No   | Display values (reference, employee count, entity code, actor name). Never pay or justifications                          | Confidential |
| `action_needed`       | `boolean`     | No   | Shown as "Action needed"; filterable                                                                                      | Internal     |
| `created_at`          | `timestamptz` | No   | UTC                                                                                                                       | Internal     |

`notification_read (notification_id, user_id, read_at)`: per-user read state (a role-addressed notification is read separately by each reviewer).

| Column (email_outbox) | Type          | Null | Meaning                                                                                                      | Sensitivity |
| --------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| `id`                  | `uuid`        | No   | Primary key                                                                                                  | Internal    |
| `notification_id`     | `uuid`        | No   | → `notification`: what to tell, and to whom. Written in the same transaction as the event (ADR-011)          | Internal    |
| `created_at`          | `timestamptz` | No   | When it was queued                                                                                           | Internal    |
| `status`              | `text`        | No   | `pending`, `sent`, `dead` (gave up) or `skipped` (no address, or content refused) (0008)                     | Internal    |
| `next_attempt_at`     | `timestamptz` | No   | When it may be claimed: due now, after a backoff, or after a claimed batch's lease (0008)                    | Internal    |
| `attempts`            | `integer`     | No   | Send attempts so far                                                                                         | Internal    |
| `last_error`          | `text`        | Yes  | A reason code only (`smtp_550`, `timeout`, `no_address`; CHECK `^[a-z0-9_]{1,64}$`), never the server's text | Internal    |
| `sent_at`             | `timestamptz` | Yes  | Set exactly when `status` is `sent` (CHECK)                                                                  | Internal    |
| `message_id`          | `text`        | Yes  | The provider's Message-ID, to trace a delivery with the provider (0008)                                      | Internal    |

No addresses are stored on the outbox: the worker looks them up when it sends (ADR-012).

### `notify.role_mailbox` — where a role's notifications are emailed (0008, configuration)

| Column       | Type          | Null | Meaning                                                                                               | Sensitivity |
| ------------ | ------------- | ---- | ----------------------------------------------------------------------------------------------------- | ----------- |
| `role`       | `text`        | No   | Primary key: an IdP app role, e.g. `PeopleForge.Reviewer`                                             | Internal    |
| `address`    | `text`        | No   | A shared mailbox or distribution list agreed with Sirius IT (A6); one plain address, ≤ 320 characters | Internal    |
| `updated_at` | `timestamptz` | No   | Last change                                                                                           | Internal    |
| `updated_by` | `text`        | No   | Who set it (the DBA until the admin screen exists, S7)                                                | Internal    |

No row for a role: its emails are skipped (`no_address`), the in-app notification is unaffected. The dev/test seed sets `PeopleForge.Reviewer → pf.reviewers@sirius.local`.

### `increments.idempotency_key` and `increments.request_sequence`

- `idempotency_key (user_id, key) → request_id`: the first creation with a key claims it, in the same transaction. A repeat or concurrent call returns the same draft. Submit reuses the table: a key claimed for one request and replayed on another is refused (409). The foreign key is `DEFERRABLE INITIALLY DEFERRED`, because the key is claimed before the request row exists.
- `request_sequence (cycle_id) → last_number`: allocates reference numbers. It is a counter only; no entity data.

## Row-Level Security

Session settings, set per transaction by `withScope` (`set_config(…, true)`): `app.user_id`, `app.scope` (`group` | `entity`), `app.entity_ids` (comma-separated UUIDs). Missing settings mean no access.

| Table                                                                                                                | Policy                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.entity`                                                                                                        | Read: `core.can_access_entity(id)`. Insert/update: group scope only                                                                                                       |
| `core.user_entity`                                                                                                   | Read: group scope, or the caller's own rows. Insert/delete: group scope only                                                                                              |
| `core.employee`                                                                                                      | All commands: `core.can_access_entity(entity_id)` (USING and WITH CHECK, so rows can't move)                                                                              |
| `increments.increment_request`, `increments.request_line`, `increments.criterion_result`, `increments.evidence_file` | All commands: `core.can_access_entity(entity_id)`                                                                                                                         |
| `increments.criterion_verification`, `increments.line_decision`, `increments.line_message`                           | All commands: `core.can_access_entity(entity_id)` (0009). Who may verify and decide (reviewers) is checked in the API                                                     |
| `increments.idempotency_key`                                                                                         | Own rows only: `user_id = core.current_user_id()`                                                                                                                         |
| `increments.status_event`                                                                                            | `core.can_access_entity(entity_id)`                                                                                                                                       |
| `audit.audit_log`                                                                                                    | Insert: `actor = core.current_user_id()` and the entity accessible. Read: group scope (`audit:read` checked in the API), or entity scope for its own entity's rows (0011) |
| `notify.notification`                                                                                                | Read: own (`recipient_user_id`), or role-addressed in group scope (the API matches the caller's roles); entity accessible. Insert: anyone acting, within their entities   |
| `notify.notification_read`                                                                                           | Own rows only                                                                                                                                                             |
| `notify.email_outbox`                                                                                                | Insert: anyone acting. Read and update: group scope (owner, runbook), and the worker role (`outbox_worker`); the app role has no `SELECT`/`UPDATE` grant                  |
| `notify.notification` (worker)                                                                                       | The worker role reads every notification (`notification_worker`), to email it                                                                                             |
| `core.increment_cycle`, `increments.criteria_set`, `increments.criterion`, `increments.request_sequence`             | No RLS: configuration (or a counter) readable by every signed-in user; configuration writes need `criteria:configure` (API)                                               |

RLS is `FORCE`d, so the owner is bound too (the seed sets group scope explicitly). Proven in `packages/db/src/rls.test.ts`.

**Grants to the app role:**

- `SELECT, INSERT, UPDATE` on entity, cycle, employee, the criteria tables, `increment_request`, `request_line`, `request_sequence`, `criterion_result` and `evidence_file`.
- `SELECT, INSERT` on `idempotency_key`, `status_event`, `line_decision`, `line_message`, `audit_log`, `notification` and `notification_read`; `INSERT` only on `email_outbox`.
- `SELECT, INSERT, DELETE` on `criterion_verification` (unticking, and resubmission's fresh check).
- `UPDATE`/`DELETE`/`TRUNCATE` on `audit_log`, `status_event`, `line_decision` and `line_message` are refused by trigger for every role.
- `SELECT` on `role_mailbox` (for the admin screen, S7).

**Grants to the worker role** (`peopleforge_worker`, ADR-012, 0008): `USAGE` on schema `notify`; `SELECT` on `notification` and `role_mailbox`; `SELECT` and `UPDATE (status, attempts, last_error, next_attempt_at, sent_at, message_id)` on `email_outbox`; and, from web migration 0002, `SELECT` on the view `auth.recipient_email`. Nothing else: no requests, employees, salaries, justifications, audit trail or sign-in tables (`email-outbox.test.ts` proves each refusal).

- `SELECT, INSERT, DELETE` on `user_entity`. No `DELETE` on business tables (soft delete), no DDL, no `BYPASSRLS`.

## Indexes

| Index                                                                                                       | Serves                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `entity.code` unique                                                                                        | Lookup by code, uniqueness                                               |
| `user_entity` PK `(user_id, entity_id)`                                                                     | Resolving a caller's subsidiaries on every request                       |
| `user_entity_entity_idx (entity_id)`                                                                        | "Who acts for this subsidiary" (admin screen, reminders)                 |
| `employee_entity_number_uidx` (live rows)                                                                   | Uniqueness and lookup of an employee number per subsidiary               |
| `employee_entity_name_idx (entity_id, lower(full_name))`                                                    | Employee search when adding to a request                                 |
| `criteria_set_one_active_uidx`                                                                              | Enforces a single active criteria set                                    |
| `criterion (criteria_set_id, position/code)` unique                                                         | Loading a set in order                                                   |
| `employee_id_entity_uidx (id, entity_id)`                                                                   | Target of the line's composite foreign key                               |
| `increment_request_entity_cycle_idx (entity_id, cycle_id, status, updated_at desc)` (live)                  | Lists and dashboards per subsidiary and cycle                            |
| `increment_request.reference` unique                                                                        | Lookup by reference, uniqueness                                          |
| `request_line_employee_uidx (request_id, employee_id)` (live)                                               | An employee once per request (backstop to the locked check)              |
| `request_line_entity_idx (entity_id)`                                                                       | RLS filter and per-subsidiary queries                                    |
| `request_line_id_entity_key (id, entity_id)` unique                                                         | Target of the result and evidence composite foreign keys                 |
| `criterion_result (line_id, criterion_id)` unique                                                           | One result per employee and criterion; loading a request                 |
| `criterion_result_entity_idx (entity_id)`                                                                   | RLS filter                                                               |
| `evidence_file.object_key` unique                                                                           | One record per stored object                                             |
| `evidence_file_line_idx (line_id, criterion_id, created_at)` (live)                                         | Files of a request in order; the 5-file count                            |
| `evidence_file_entity_idx (entity_id)`                                                                      | RLS filter                                                               |
| `increment_request_submitted_idx (status, submitted_at desc)` (live)                                        | Sirius queue of submitted requests                                       |
| `status_event_request_idx (request_id, at)`, `status_event_entity_idx (entity_id, at)`                      | A request's history; per-subsidiary TAT (R1-11)                          |
| `audit_log_subject_idx`, `audit_log_actor_idx`, `audit_log_entity_idx` (each with `at`)                     | Trail of a record, of a user, of a subsidiary                            |
| `audit_log_request_idx ((details ->> 'requestId'), at) where details ? 'requestId'`                         | A request's History: entries about its employees, files, messages (0011) |
| `notification_user_idx`, `notification_role_idx` (partial, `created_at desc`)                               | The notifications page and bell                                          |
| `email_outbox_pending_idx (created_at) where sent_at is null`                                               | The sender's queue                                                       |
| `increment_request_cycle_idx (cycle_id, status, created_at desc)` (live)                                    | Sirius HR's dashboard: every subsidiary in a cycle                       |
| `request_line_name_trgm_idx`, `request_line_number_trgm_idx` (GIN, `lower(…)` with `gin_trgm_ops`, live)    | Dashboard search anywhere in an employee's name or number                |
| `increment_request_reference_trgm_idx` (GIN, `lower(reference)`, live)                                      | Dashboard search by request reference                                    |
| `request_line_review_idx (review_status, request_id)` (live)                                                | The review queue: employees by review status (0009)                      |
| `criterion_verification_entity_idx (entity_id)`                                                             | RLS filter                                                               |
| `line_decision_line_idx (line_id, decided_at desc)`                                                         | An employee's latest decision                                            |
| `line_decision_request_idx (request_id, decided_at)`, `line_decision_entity_idx (entity_id, decided_at)`    | A request's decisions in order; back-and-forth (R1-12)                   |
| `line_message_line_idx (line_id, created_at)`                                                               | An employee's thread in order (0010)                                     |
| `line_message_entity_idx (entity_id, created_at desc)`, `line_message_request_idx (request_id, created_at)` | Conversations page per subsidiary; a request's messages (R1-12)          |

## Dashboard queries (S4b, `packages/db/src/dashboard.ts`)

"My increment requests" reads requests, employees and counts under the same Row-Level Security as everything else. It never reads justifications or files, only whether they exist (`justification is not null`, a count of live files), and the API judges completeness from those facts with the same rule as the request page. Search is a parameterised `lower(column) LIKE lower($1)` with the user's `%`, `_` and `\` escaped. It uses the `pg_trgm` trigram indexes above (extension enabled by migration 0006; trusted, so the database owner can create it). Salaries are decrypted only to compute an amount proposal's percentage; lists never return them.

## Review queries (S5a, `packages/db/src/review.ts`)

The review queue lists live lines of non-draft requests with their review status, filtered by chip (`pending`, `returned`, `overdue` = pending since before the reminder cut-off, `open` = pending or returned, `all`), oldest waiting first, with the counts per chip in one aggregate query. It decrypts the salary only to derive a proposal's percentage; it never returns salaries, justifications or comments. Verifying, deciding and resubmitting lock the request row (`FOR UPDATE`), so two reviewers can't decide the same employee twice; decisions are idempotent per user and key.

## Retention (proposal, confirm with Sirius under NFR-PRIV-01)

| Data                            | Retention                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Entities, cycles, criteria sets | Kept (configuration history; requests reference them)                                               |
| User → entity rows              | Deleted when access ends; the audit log (R1-15) keeps the history                                   |
| Interim employee directory      | Superseded by R2 records; soft-deleted rows purged after the retention period agreed for HR records |
| Increment requests and lines    | To agree with Sirius (Q10); proposal: decided requests 7 years, abandoned drafts 1 year             |
| Idempotency keys                | 30 days (purge job, with the session purge)                                                         |
| Criterion results               | With their request                                                                                  |
| Evidence files (rows + objects) | With their request; removed files (soft-deleted) purged after the agreed period (Q10)               |
| Status events                   | With their request                                                                                  |
| Audit log                       | Proposal: 7 years, then archived; partition by month once volumes are known (ADR-004)               |
| Notifications and read state    | Proposal: 12 months                                                                                 |
| Email outbox                    | Sent rows: 30 days                                                                                  |
