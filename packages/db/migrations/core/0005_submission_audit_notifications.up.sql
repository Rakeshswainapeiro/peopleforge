-- 0005 — Submitting a request to Sirius HR (R1-07), its status history (R1-11/R1-12 basis),
-- the append-only audit trail (R1-15) and in-app notifications with an email outbox (R1-07,
-- R1-13). Slice S4a. Data dictionary: docs/database/core-schema.md; decisions: ADR-011.

-- Status: more values arrive with review and decisions (S5). Submitted requests are read-only.
ALTER TABLE increments.increment_request DROP CONSTRAINT increment_request_status_check;
ALTER TABLE increments.increment_request
  ADD CONSTRAINT increment_request_status_check CHECK (status IN ('draft', 'submitted'));
ALTER TABLE increments.increment_request
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN submitted_by text,
  ADD CONSTRAINT increment_request_submitted_check
    CHECK ((status = 'draft') = (submitted_at IS NULL) AND (submitted_at IS NULL) = (submitted_by IS NULL));
CREATE INDEX increment_request_submitted_idx
  ON increments.increment_request (status, submitted_at DESC) WHERE deleted_at IS NULL;

-- Every status change, in order: who, when, from → to. Append-only: never updated or deleted.
CREATE TABLE increments.status_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text CHECK (char_length(reason) <= 2000),
  FOREIGN KEY (request_id, entity_id) REFERENCES increments.increment_request (id, entity_id)
);
CREATE INDEX status_event_request_idx ON increments.status_event (request_id, at);
CREATE INDEX status_event_entity_idx ON increments.status_event (entity_id, at);

-- Audit trail (R1-15, NFR-AUD-01): one row per action, never changed. The app role may only
-- insert and read; a trigger refuses UPDATE and DELETE for every role, the owner included.
CREATE SCHEMA IF NOT EXISTS audit;
CREATE TABLE audit.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor text NOT NULL,
  -- Dotted verb, e.g. increment_request.submitted, evidence.downloaded.
  action text NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_id uuid,
  subject_type text NOT NULL CHECK (subject_type ~ '^[a-z_]+$'),
  subject_id text NOT NULL,
  -- What changed, without salaries, justifications or file contents (NFR-PRIV-01).
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object'),
  correlation_id text
);
CREATE INDEX audit_log_subject_idx ON audit.audit_log (subject_type, subject_id, at);
CREATE INDEX audit_log_actor_idx ON audit.audit_log (actor, at);
CREATE INDEX audit_log_entity_idx ON audit.audit_log (entity_id, at);

CREATE FUNCTION audit.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit.refuse_change();
CREATE TRIGGER status_event_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON increments.status_event
  FOR EACH STATEMENT EXECUTE FUNCTION audit.refuse_change();

-- Notifications (R1-07, R1-13): to one user, or to everyone holding a role (Sirius users are
-- not stored here; their roles come from the identity provider).
CREATE SCHEMA IF NOT EXISTS notify;
CREATE TABLE notify.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id text,
  recipient_role text,
  entity_id uuid REFERENCES core.entity (id),
  request_id uuid REFERENCES increments.increment_request (id),
  -- What happened, e.g. request_submitted; the text is built per locale from kind + params.
  kind text NOT NULL CHECK (kind ~ '^[a-z_]+$'),
  -- Display values only (reference, counts, actor name); never salaries or justifications.
  params jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(params) = 'object'),
  action_needed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((recipient_user_id IS NULL) <> (recipient_role IS NULL))
);
CREATE INDEX notification_user_idx ON notify.notification (recipient_user_id, created_at DESC)
  WHERE recipient_user_id IS NOT NULL;
CREATE INDEX notification_role_idx ON notify.notification (recipient_role, created_at DESC)
  WHERE recipient_role IS NOT NULL;

CREATE TABLE notify.notification_read (
  notification_id uuid NOT NULL REFERENCES notify.notification (id),
  user_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

-- Emails to send, written in the same transaction as the event (outbox). The worker that sends
-- them arrives with the email provider (A6); until then rows wait here.
CREATE TABLE notify.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notify.notification (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX email_outbox_pending_idx ON notify.email_outbox (created_at) WHERE sent_at IS NULL;

-- Row-Level Security.
ALTER TABLE increments.status_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.status_event FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON increments.status_event
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_log FORCE ROW LEVEL SECURITY;
-- Anyone acting may record their own actions, within their scope.
CREATE POLICY audit_insert ON audit.audit_log FOR INSERT
  WITH CHECK (core.current_user_id() <> '' AND actor = core.current_user_id()
              AND (entity_id IS NULL OR core.can_access_entity(entity_id)));
-- Reading the trail is for group scope (audit:read is checked in the API).
CREATE POLICY audit_read ON audit.audit_log FOR SELECT USING (core.current_scope() = 'group');

ALTER TABLE notify.notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify.notification FORCE ROW LEVEL SECURITY;
-- A user reads their own; role-addressed ones only from group scope (the API also matches the
-- caller's roles). Entity-linked rows stay within the reader's entities.
CREATE POLICY notification_read ON notify.notification FOR SELECT USING (
  (entity_id IS NULL OR core.can_access_entity(entity_id))
  AND ((recipient_user_id IS NOT NULL AND recipient_user_id = core.current_user_id())
       OR (recipient_role IS NOT NULL AND core.current_scope() = 'group')));
-- Notifications are created by whoever acts, about entities they can access.
CREATE POLICY notification_insert ON notify.notification FOR INSERT
  WITH CHECK (core.current_user_id() <> '' AND (entity_id IS NULL OR core.can_access_entity(entity_id)));

ALTER TABLE notify.notification_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify.notification_read FORCE ROW LEVEL SECURITY;
CREATE POLICY own_reads ON notify.notification_read
  USING (core.current_user_id() <> '' AND user_id = core.current_user_id())
  WITH CHECK (core.current_user_id() <> '' AND user_id = core.current_user_id());

ALTER TABLE notify.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify.email_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_insert ON notify.email_outbox FOR INSERT
  WITH CHECK (core.current_user_id() <> '');
-- For the sender (worker role, with its own grants later) acting in group scope.
CREATE POLICY outbox_sender ON notify.email_outbox FOR SELECT USING (core.current_scope() = 'group');

GRANT USAGE ON SCHEMA audit, notify TO {{APP_ROLE}};
GRANT SELECT, INSERT ON increments.status_event, audit.audit_log TO {{APP_ROLE}};
GRANT SELECT, INSERT ON notify.notification TO {{APP_ROLE}};
GRANT SELECT, INSERT ON notify.notification_read TO {{APP_ROLE}};
-- The web/API role only queues emails; the worker (own role, later) reads and marks them.
GRANT INSERT ON notify.email_outbox TO {{APP_ROLE}};
