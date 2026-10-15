-- Reverts 0006. The pg_trgm extension stays: other objects may use it, and it holds no data.
DROP INDEX IF EXISTS increments.increment_request_reference_trgm_idx;
DROP INDEX IF EXISTS increments.request_line_number_trgm_idx;
DROP INDEX IF EXISTS increments.request_line_name_trgm_idx;
DROP INDEX IF EXISTS increments.increment_request_cycle_idx;
ALTER TABLE increments.increment_request DROP COLUMN status_changed_at;
