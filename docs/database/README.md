# Database documentation

**Status:** no tables yet. The data model is part of the solution design (SOW-D2) and lands with ADR-002 after go-ahead. This file defines the conventions every migration must follow, so the schema is documented and production-ready from the first table.

## What lives here

| File                 | Contents                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `README.md`          | Conventions (this file)                                                        |
| `erd.md`             | Entity-relationship diagram (Mermaid), regenerated with each migration         |
| `data-dictionary.md` | Every table and column: type, nullability, meaning, sensitivity, BRD reference |
| `rls-policies.md`    | Row-Level Security policy per table and the session settings they rely on      |
| `indexes.md`         | Each index and the query pattern it serves                                     |
| `retention.md`       | Retention period and deletion/anonymisation rule per data type (NFR-PRIV-01)   |

A migration PR that doesn't update the relevant files is incomplete.

## Conventions

**Identifiers and types**

- Primary keys: `uuid` (v7, time-ordered for index locality), column `id`.
- Timestamps: `timestamptz`, stored in UTC; `created_at`, `updated_at` on every business table.
- Money: `numeric(18,2)` plus an explicit `currency char(3)` column — never float. Percentages: `numeric(9,4)`.
- Text: UTF-8, NFC-normalised before insert (`normaliseText` in `@sirius-hr/utils`) so Arabic and Latin names compare reliably.
- Enumerations that admins can change (criteria, field templates, anomaly rules) are rows in configuration tables, not Postgres enums (R1-05, NFR-CFG-01).

**Entity isolation (R1-01, R2-12, NFR-SEC-01)**

- Every subsidiary-owned table has `entity_id uuid not null` and RLS enabled with `FORCE ROW LEVEL SECURITY`.
- The API sets `app.user_id`, `app.scope` and `app.entity_ids` per transaction with `SET LOCAL`; policies read them via `current_setting`.
- The application role is not the table owner and has no `BYPASSRLS`. Migrations run as a separate owner role.
- Every repository also filters by entity explicitly (defence in depth), and integration tests prove cross-entity reads and writes fail.

**History and audit (R1-15, R2-04, R2-13, NFR-AUD-01)**

- Business records are soft-deleted (`deleted_at`); hard deletes only via the retention job.
- Employee period data is append-only: a correction is a new version row, never an `UPDATE` of the canonical record.
- The audit table grants `INSERT` and `SELECT` only to the application role — `UPDATE`/`DELETE` are revoked at the database level.

**Scale (NFR-PERF-01, NFR-SCALE-01)**

- High-growth tables (employee period snapshots, audit log) are range-partitioned by period.
- Dashboard queries read pre-aggregated tables refreshed by the worker, not raw snapshots.
- Every foreign key and every `(entity_id, period)` filter has a supporting index.

**Migrations**

- Forward-only files with a paired, tested rollback script.
- Expand/contract for breaking changes; no long-held locks (`CREATE INDEX CONCURRENTLY`, batched backfills).
- Never edit a migration that has been applied in any shared environment.
