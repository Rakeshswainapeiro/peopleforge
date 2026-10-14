# Schemas `core` and `increments` (slices S1–S3)

Migrations: `packages/db/migrations/core/0001_core_schema`, `0002_placeholder_configuration`, `0003_increment_requests`, `0004_criteria_evidence` (up/down), recorded in `migrations.core`. Decisions: ADR-002 (data access, RLS), ADR-008 (field encryption), ADR-010 (evidence files). Design: `docs/design/r1-increment-portal.md` §3a.

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
  ENTITY { uuid id PK; text code UK; jsonb name; char3 default_currency }
  USER_ENTITY { text user_id PK; uuid entity_id PK,FK }
  EMPLOYEE { uuid id PK; uuid entity_id FK; text employee_number; text full_name; text grade; bytea monthly_salary; char3 currency }
  INCREMENT_CYCLE { uuid id PK; jsonb name; date starts_on; date ends_on; date submission_deadline; text status }
  CRITERIA_SET { uuid id PK; int version UK; text status }
  CRITERION { uuid id PK; uuid criteria_set_id FK; smallint position; text code; jsonb name; jsonb description; text evidence_policy }
  INCREMENT_REQUEST { uuid id PK; text reference UK; uuid entity_id FK; uuid cycle_id FK; uuid criteria_set_id FK; text status; int version }
  REQUEST_LINE { uuid id PK; uuid request_id FK; uuid entity_id FK; uuid employee_id FK; text grade; bytea current_salary; char3 currency; text proposed_kind; bytea proposed_value }
  IDEMPOTENCY_KEY { text user_id PK; text key PK; uuid request_id FK }
  REQUEST_SEQUENCE { uuid cycle_id PK; int last_number }
  CRITERION_RESULT { uuid id PK; uuid line_id FK; uuid entity_id FK; uuid criterion_id FK; text result; bytea justification }
  EVIDENCE_FILE { uuid id PK; uuid line_id FK; uuid entity_id FK; uuid criterion_id FK; text object_key UK; text file_name; text media_type; int size_bytes; char64 sha256; text scan_engine }
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

| Column            | Type          | Null | Meaning                                                                    | Sensitivity |
| ----------------- | ------------- | ---- | -------------------------------------------------------------------------- | ----------- |
| `id`              | `uuid`        | No   | Primary key (chosen by the API before insert)                              | Internal    |
| `reference`       | `text`        | No   | `INC-<cycle start year>-<NNNN>`, unique; numbered per cycle                | Internal    |
| `entity_id`       | `uuid`        | No   | → `core.entity`; drives RLS                                                | Internal    |
| `cycle_id`        | `uuid`        | No   | → `core.increment_cycle` (must be `open` at creation)                      | Internal    |
| `criteria_set_id` | `uuid`        | No   | The criteria set active at creation; later changes don't affect it (R1-05) | Internal    |
| `status`          | `text`        | No   | `draft` (submission and decisions arrive in S4–S5)                         | Internal    |
| `version`         | `integer`     | No   | Bumped by every change; a save with a stale version is refused (409)       | Internal    |
| `deleted_at`      | `timestamptz` | Yes  | Soft delete                                                                | Internal    |

Unique `(id, entity_id)` exists so lines can reference the pair.

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

### `increments.idempotency_key` and `increments.request_sequence`

- `idempotency_key (user_id, key) → request_id`: the first creation with a key claims it, in the same transaction. A repeat or concurrent call returns the same draft. The foreign key is `DEFERRABLE INITIALLY DEFERRED`, because the key is claimed before the request row exists.
- `request_sequence (cycle_id) → last_number`: allocates reference numbers. It is a counter only; no entity data.

## Row-Level Security

Session settings, set per transaction by `withScope` (`set_config(…, true)`): `app.user_id`, `app.scope` (`group` | `entity`), `app.entity_ids` (comma-separated UUIDs). Missing settings mean no access.

| Table                                                                                                                | Policy                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `core.entity`                                                                                                        | Read: `core.can_access_entity(id)`. Insert/update: group scope only                                                         |
| `core.user_entity`                                                                                                   | Read: group scope, or the caller's own rows. Insert/delete: group scope only                                                |
| `core.employee`                                                                                                      | All commands: `core.can_access_entity(entity_id)` (USING and WITH CHECK, so rows can't move)                                |
| `increments.increment_request`, `increments.request_line`, `increments.criterion_result`, `increments.evidence_file` | All commands: `core.can_access_entity(entity_id)`                                                                           |
| `increments.idempotency_key`                                                                                         | Own rows only: `user_id = core.current_user_id()`                                                                           |
| `core.increment_cycle`, `increments.criteria_set`, `increments.criterion`, `increments.request_sequence`             | No RLS: configuration (or a counter) readable by every signed-in user; configuration writes need `criteria:configure` (API) |

RLS is `FORCE`d, so the owner is bound too (the seed sets group scope explicitly). Proven in `packages/db/src/rls.test.ts`.

**Grants to the app role:**

- `SELECT, INSERT, UPDATE` on entity, cycle, employee, the criteria tables, `increment_request`, `request_line`, `request_sequence`, `criterion_result` and `evidence_file`.
- `SELECT, INSERT` on `idempotency_key`.
- `SELECT, INSERT, DELETE` on `user_entity`. No `DELETE` on business tables (soft delete), no DDL, no `BYPASSRLS`.

## Indexes

| Index                                                                                      | Serves                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `entity.code` unique                                                                       | Lookup by code, uniqueness                                  |
| `user_entity` PK `(user_id, entity_id)`                                                    | Resolving a caller's subsidiaries on every request          |
| `user_entity_entity_idx (entity_id)`                                                       | "Who acts for this subsidiary" (admin screen, reminders)    |
| `employee_entity_number_uidx` (live rows)                                                  | Uniqueness and lookup of an employee number per subsidiary  |
| `employee_entity_name_idx (entity_id, lower(full_name))`                                   | Employee search when adding to a request                    |
| `criteria_set_one_active_uidx`                                                             | Enforces a single active criteria set                       |
| `criterion (criteria_set_id, position/code)` unique                                        | Loading a set in order                                      |
| `employee_id_entity_uidx (id, entity_id)`                                                  | Target of the line's composite foreign key                  |
| `increment_request_entity_cycle_idx (entity_id, cycle_id, status, updated_at desc)` (live) | Lists and dashboards per subsidiary and cycle               |
| `increment_request.reference` unique                                                       | Lookup by reference, uniqueness                             |
| `request_line_employee_uidx (request_id, employee_id)` (live)                              | An employee once per request (backstop to the locked check) |
| `request_line_entity_idx (entity_id)`                                                      | RLS filter and per-subsidiary queries                       |
| `request_line_id_entity_key (id, entity_id)` unique                                        | Target of the result and evidence composite foreign keys    |
| `criterion_result (line_id, criterion_id)` unique                                          | One result per employee and criterion; loading a request    |
| `criterion_result_entity_idx (entity_id)`                                                  | RLS filter                                                  |
| `evidence_file.object_key` unique                                                          | One record per stored object                                |
| `evidence_file_line_idx (line_id, criterion_id, created_at)` (live)                        | Files of a request in order; the 5-file count               |
| `evidence_file_entity_idx (entity_id)`                                                     | RLS filter                                                  |

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
