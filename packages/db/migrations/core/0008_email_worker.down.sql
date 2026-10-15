-- Reverts 0008. Delivery state is lost; emails not yet sent stay queued for a later worker.
REVOKE ALL ON notify.email_outbox, notify.notification FROM {{WORKER_ROLE}};
REVOKE USAGE ON SCHEMA notify FROM {{WORKER_ROLE}};
DROP POLICY notification_worker ON notify.notification;
DROP POLICY outbox_worker ON notify.email_outbox;
DROP POLICY outbox_operations ON notify.email_outbox;
DROP TABLE notify.role_mailbox;
DROP INDEX notify.email_outbox_dead_idx;
DROP INDEX notify.email_outbox_due_idx;
ALTER TABLE notify.email_outbox
  DROP CONSTRAINT email_outbox_error_check,
  DROP CONSTRAINT email_outbox_sent_check,
  DROP COLUMN message_id,
  DROP COLUMN next_attempt_at,
  DROP COLUMN status;
CREATE INDEX email_outbox_pending_idx ON notify.email_outbox (created_at) WHERE sent_at IS NULL;
