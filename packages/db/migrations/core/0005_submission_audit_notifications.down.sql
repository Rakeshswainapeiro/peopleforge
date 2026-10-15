-- Reverts 0005. Destroys the audit trail, status history and notifications: only for a
-- migration that must be undone (export the audit log first in any shared environment).
DROP SCHEMA notify CASCADE;
DROP TABLE increments.status_event;
DROP SCHEMA audit CASCADE;
DROP INDEX increments.increment_request_submitted_idx;
ALTER TABLE increments.increment_request
  DROP CONSTRAINT increment_request_submitted_check,
  DROP COLUMN submitted_at,
  DROP COLUMN submitted_by;
-- Row-Level Security binds the owner too: act as group scope to reach every request.
SELECT set_config('app.scope', 'group', true);
UPDATE increments.increment_request SET status = 'draft' WHERE status = 'submitted';
ALTER TABLE increments.increment_request DROP CONSTRAINT increment_request_status_check;
ALTER TABLE increments.increment_request
  ADD CONSTRAINT increment_request_status_check CHECK (status IN ('draft'));
