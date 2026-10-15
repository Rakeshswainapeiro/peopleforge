-- 0008 — Email worker (S4b-2, ADR-012): delivery state on the outbox, role mailboxes, and the
-- worker role's least-privilege grants. Data dictionary: docs/database/core-schema.md.

-- The worker role is created once per environment by the DBA (DEPLOYMENT.md §6), like the app
-- role. Fail with a clear message rather than a bare "role does not exist".
DO $$
BEGIN
  IF to_regrole('{{WORKER_ROLE}}') IS NULL THEN
    RAISE EXCEPTION 'Role {{WORKER_ROLE}} does not exist: create it before migrating (DEPLOYMENT.md §6)';
  END IF;
END $$;

-- Delivery state. `now()` (not clock_timestamp()) keeps the column add a catalogue-only change.
ALTER TABLE notify.email_outbox
  ADD COLUMN status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'dead', 'skipped')),
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN message_id text CHECK (char_length(message_id) <= 998),
  ADD CONSTRAINT email_outbox_sent_check CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  -- Reason codes only (e.g. "smtp_550", "no_address"): never server text, which can echo addresses.
  ADD CONSTRAINT email_outbox_error_check CHECK (last_error ~ '^[a-z0-9_]{1,64}$');

DROP INDEX notify.email_outbox_pending_idx;
-- What the worker claims next.
CREATE INDEX email_outbox_due_idx ON notify.email_outbox (next_attempt_at) WHERE status = 'pending';
-- Failed emails, for the alert and the runbook.
CREATE INDEX email_outbox_dead_idx ON notify.email_outbox (created_at) WHERE status = 'dead';

-- Where role-addressed notifications are emailed (configuration, NFR-CFG-01): a shared
-- mailbox or distribution list per role, agreed with Sirius IT (A6). No row: the email is
-- skipped (in-app notification only) and the worker logs it.
CREATE TABLE notify.role_mailbox (
  role text PRIMARY KEY CHECK (role ~ '^[A-Za-z0-9._-]{1,100}$'),
  address text NOT NULL CHECK (
    char_length(address) <= 320
    AND address ~ '^[^[:space:]@<>()",;:\\]+@[^[:space:]@<>()",;:\\]+\.[^[:space:]@<>()",;:\\]+$'
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 200)
);

-- The worker reads what to send and records how it went; nothing else (no requests, salaries,
-- justifications or audit trail). The app role keeps INSERT only on the outbox.
CREATE POLICY outbox_worker ON notify.email_outbox FOR ALL TO {{WORKER_ROLE}}
  USING (true) WITH CHECK (true);
CREATE POLICY notification_worker ON notify.notification FOR SELECT TO {{WORKER_ROLE}}
  USING (true);
-- Operations (runbook: requeue failed emails) as the owner in group scope. The app role has no
-- UPDATE grant on the outbox, so this gives it nothing.
CREATE POLICY outbox_operations ON notify.email_outbox FOR UPDATE
  USING (core.current_scope() = 'group') WITH CHECK (core.current_scope() = 'group');

GRANT USAGE ON SCHEMA notify TO {{WORKER_ROLE}};
GRANT SELECT ON notify.notification, notify.role_mailbox TO {{WORKER_ROLE}};
GRANT SELECT, UPDATE (status, attempts, last_error, next_attempt_at, sent_at, message_id)
  ON notify.email_outbox TO {{WORKER_ROLE}};
-- Mailboxes are read by the API (admin screen later, S7); changed by the DBA until then.
GRANT SELECT ON notify.role_mailbox TO {{APP_ROLE}};
