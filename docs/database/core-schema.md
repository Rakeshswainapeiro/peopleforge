# Schemas `core` and `increments` (slice S1)

Migrations: `packages/db/migrations/core/0001_core_schema`, `0002_placeholder_configuration` (up/down), recorded in `migrations.core`. Decisions: ADR-002 (data access, RLS), ADR-008 (salary encryption). Design: `docs/design/r1-increment-portal.md` §3a.

Every table here also carries `created_at`, `created_by`, `updated_at`, `updated_by` (UTC timestamps, user IDs), and `version` (optimistic locking) where rows are edited. `created_by`/`updated_by` is `seed` for migration and seed rows.

## ERD

```mermaid
erDiagram
  ENTITY ||--o{ USER_ENTITY : "assigned to"
  ENTITY ||--o{ EMPLOYEE : employs
  CRITERIA_SET ||--|{ CRITERION : contains
  INCREMENT_CYCLE
  ENTITY { uuid id PK; text code UK; jsonb name; char3 default_currency }
  USER_ENTITY { text user_id PK; uuid entity_id PK,FK }
  EMPLOYEE { uuid id PK; uuid entity_id FK; text employee_number; text full_name; text grade; bytea monthly_salary; char3 currency }
  INCREMENT_CYCLE { uuid id PK; jsonb name; date starts_on; date ends_on; date submission_deadline; text status }
  CRITERIA_SET { uuid id PK; int version UK; text status }
  CRITERION { uuid id PK; uuid criteria_set_id FK; smallint position; text code; jsonb name; jsonb description; text evidence_policy }
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

## Row-Level Security

Session settings, set per transaction by `withScope` (`set_config(…, true)`): `app.user_id`, `app.scope` (`group` | `entity`), `app.entity_ids` (comma-separated UUIDs). Missing settings mean no access.

| Table                                  | Policy                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `core.entity`                          | Read: `core.can_access_entity(id)`. Insert/update: group scope only                            |
| `core.user_entity`                     | Read: group scope, or the caller's own rows. Insert/delete: group scope only                   |
| `core.employee`                        | All commands: `core.can_access_entity(entity_id)` (USING and WITH CHECK, so rows can't move)   |
| `core.increment_cycle`, `increments.*` | No RLS: configuration readable by every signed-in user; writes need `criteria:configure` (API) |

RLS is `FORCE`d, so the owner is bound too (the seed sets group scope explicitly). Proven in `packages/db/src/rls.test.ts`.

**Grants to the app role:** `SELECT, INSERT, UPDATE` on entity, cycle, employee and the criteria tables; `SELECT, INSERT, DELETE` on `user_entity`. No `DELETE` on business tables (soft delete), no DDL, no `BYPASSRLS`.

## Indexes

| Index                                                    | Serves                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `entity.code` unique                                     | Lookup by code, uniqueness                                 |
| `user_entity` PK `(user_id, entity_id)`                  | Resolving a caller's subsidiaries on every request         |
| `user_entity_entity_idx (entity_id)`                     | "Who acts for this subsidiary" (admin screen, reminders)   |
| `employee_entity_number_uidx` (live rows)                | Uniqueness and lookup of an employee number per subsidiary |
| `employee_entity_name_idx (entity_id, lower(full_name))` | Employee search when adding to a request                   |
| `criteria_set_one_active_uidx`                           | Enforces a single active criteria set                      |
| `criterion (criteria_set_id, position/code)` unique      | Loading a set in order                                     |

## Retention (proposal, confirm with Sirius under NFR-PRIV-01)

| Data                            | Retention                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Entities, cycles, criteria sets | Kept (configuration history; requests reference them)                                               |
| User → entity rows              | Deleted when access ends; the audit log (R1-15) keeps the history                                   |
| Interim employee directory      | Superseded by R2 records; soft-deleted rows purged after the retention period agreed for HR records |
