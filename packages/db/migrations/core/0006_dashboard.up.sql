-- 0006 — "My increment requests" dashboard (R1-10, DASH-D1). Slice S4b-1.
-- Data dictionary: docs/database/core-schema.md.

-- When the status last changed: the dashboard's Age and Last update (Q6 default: calendar
-- days since the last status change; drafts since creation). Set by every status change.
ALTER TABLE increments.increment_request ADD COLUMN status_changed_at timestamptz;
-- Backfill as the owner, who is bound by Row-Level Security too (FORCE): group scope.
SELECT set_config('app.scope', 'group', true);
UPDATE increments.increment_request
   SET status_changed_at = coalesce(submitted_at, created_at);
ALTER TABLE increments.increment_request
  ALTER COLUMN status_changed_at SET DEFAULT now(),
  ALTER COLUMN status_changed_at SET NOT NULL;

-- Sirius HR lists every subsidiary's requests in a cycle, newest first.
CREATE INDEX increment_request_cycle_idx
  ON increments.increment_request (cycle_id, status, created_at DESC) WHERE deleted_at IS NULL;

-- "Search: employee name, employee ID or request ID" matches anywhere in the text, so it needs
-- trigram indexes (a b-tree only serves prefixes). pg_trgm is a trusted extension: the
-- database owner can enable it, no superuser needed.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX request_line_name_trgm_idx
  ON increments.request_line USING gin (lower(full_name) public.gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX request_line_number_trgm_idx
  ON increments.request_line USING gin (lower(employee_number) public.gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX increment_request_reference_trgm_idx
  ON increments.increment_request USING gin (lower(reference) public.gin_trgm_ops)
  WHERE deleted_at IS NULL;
