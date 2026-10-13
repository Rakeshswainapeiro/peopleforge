# ADR-002: Data access, migrations and Row-Level Security

- **Status:** Proposed (2026-10-13), for go-ahead before slice S1 is built.
- **Requirements:** R1-01, R2-12, NFR-SEC-01, NFR-AUD-01, NFR-CFG-01
- **Related:** ADR-003 (identity), ADR-005 (access policy), ADR-008 (salary encryption), `docs/design/r1-increment-portal.md`

## Context

PeopleForge holds employee pay data for many subsidiaries. A Subsidiary HR user must never read or write another subsidiary's data. Sirius HR sees every subsidiary. Checking this only in application code means one forgotten `WHERE entity_id = …` leaks data. The database must refuse it as well.

We also need migrations that are reviewable, with a tested rollback. The web app already has a small SQL migration runner for its `auth` schema.

## Decision

### 1. One business database, schemas per area

- `core`: entities (subsidiaries), user-to-entity assignments, increment cycles. Shared by R1, R2 and later phases.
- `increments`: the R1 tables.
- `auth`: web sign-in, owned by the web app.
- `audit`: append-only audit log.

The R2 schemas follow the same rules when they arrive.

### 2. Data access: Kysely and plain SQL migrations, in `packages/db`

- Kysely is a typed query builder. It is always parameterised, and is already a dependency of Better Auth.
- Schema changes are hand-written SQL files `NNNN_name.up.sql` / `.down.sql`, applied by the same runner the web app uses, which moves to `packages/db`. Each module records what it applied in its own table: `migrations.core`, `migrations.web`.
- Migrations run as the schema **owner**. The API connects as `peopleforge_app`, which has data access only and no DDL.

**Alternatives:**

- Prisma: weak support for per-transaction session settings, which RLS needs, and it adds a binary engine to the images.
- Drizzle: fine, but it would be a second query layer next to Kysely.
- A full ORM with entities: hides the SQL we need to review for RLS.

### 3. Row-Level Security on every table that has `entity_id`

- RLS is `ENABLE`d and `FORCE`d, so it binds the table owner too.
- **Deny by default.** No rows are visible unless the transaction says who is asking.
- Every API request runs its queries inside `withScope(principal, work)`. That opens a transaction and sets, with `SET LOCAL`:
  - `app.user_id`: the Entra object ID;
  - `app.scope`: `group` or `entity`;
  - `app.entity_ids`: the caller's subsidiaries, comma-separated UUIDs.
- These settings disappear at the end of the transaction. A pooled connection never carries them over to the next request.
- One policy per table:

  ```sql
  CREATE POLICY entity_isolation ON increments.increment_request
    USING      (core.can_access_entity(entity_id))
    WITH CHECK (core.can_access_entity(entity_id));
  ```

  `core.can_access_entity(id)` returns true when `app.scope = 'group'`, or when `id` is in `app.entity_ids`. It returns false if the settings are missing.

- Configuration tables have no `entity_id` (criteria, cycles). Everyone signed in can read them; only the configure permission (checked in the API) can write them.
- The application layer still checks too:
  - the permission on every route (ADR-005);
  - an `entity_id` filter in every repository query, so plans use the indexes and errors are clear.

  RLS is the second wall, not the only one.

### 4. Who belongs to which subsidiary

- `core.user_entity (user_id, entity_id)` is maintained by Sirius HR admins.
- The API fills `Principal.entityIds` from this table when it resolves the caller.
- Sirius roles (Admin, Reviewer, Executive) are group-wide and need no rows.
- A Subsidiary HR user without rows sees nothing. That is today's behaviour, now backed by the database.

### 5. Conventions for every table

- `id uuid DEFAULT gen_random_uuid()`.
- `created_at` / `updated_at timestamptz` (UTC).
- `created_by` / `updated_by` (user ID).
- `version int` for optimistic locking.
- `deleted_at` for soft delete of business rows.
- Free text is NFC-normalised before insert; names are stored in full Unicode.

### 6. Testing

Integration tests run against a real PostgreSQL. Locally that is the `peopleforge_test` database from local-infra; CI uses the PostgreSQL service already set up for the end-to-end tests. For each table they prove:

- with no scope, a query returns no rows;
- a Subsidiary A user cannot select, insert, update or delete a Subsidiary B row;
- a Sirius HR user sees both.

## Consequences

- Every database call goes through `withScope`. Code that bypasses it sees no data, which fails safe and shows up in tests.
- Dashboards (D1–D4, D5–D8) query through the same scope. Pre-aggregated tables carry `entity_id` and the same policy.
- RLS adds a per-row check. With indexes on `entity_id` the cost is negligible at the volumes expected in ADR-004 (still to be written: entities, employees per entity and periods retained are not yet agreed).
- The web app's `auth` schema keeps its own migrations, now through the shared runner.
