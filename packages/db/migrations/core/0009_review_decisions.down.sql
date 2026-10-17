-- Reverts 0009. Destroys verifications and decisions: only for a migration that must be undone.
DROP INDEX increments.request_line_review_idx;
DROP TABLE increments.line_decision;
DROP TABLE increments.criterion_verification;
ALTER TABLE increments.request_line DROP COLUMN review_changed_at, DROP COLUMN review_status;
ALTER TABLE increments.increment_request DROP CONSTRAINT increment_request_decided_check;
ALTER TABLE increments.increment_request DROP COLUMN decided_at;
-- Row-Level Security binds the owner too: act as group scope to reach every request.
SELECT set_config('app.scope', 'group', true);
UPDATE increments.increment_request SET status = 'submitted'
  WHERE status IN ('under_review', 'returned', 'approved', 'partly_approved', 'rejected');
ALTER TABLE increments.increment_request DROP CONSTRAINT increment_request_status_check;
ALTER TABLE increments.increment_request
  ADD CONSTRAINT increment_request_status_check CHECK (status IN ('draft', 'submitted'));
