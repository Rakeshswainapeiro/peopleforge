-- 0011 — Request history and audited reports (R1-14, R1-15). Slice S6.
-- Data dictionary: docs/database/core-schema.md.

-- Who acted, by name, as the API knew them at the time (the identity provider holds names; we
-- keep none elsewhere). Filled by default from the transaction's `app.user_name`, so every
-- audit insert records it without each call passing it.
ALTER TABLE audit.audit_log ADD COLUMN actor_name text
  DEFAULT left(nullif(current_setting('app.user_name', true), ''), 200);

-- A subsidiary reads the trail of its own records (the History of its requests, R1-15). The
-- whole trail stays for group scope with `audit:read` (checked in the API).
CREATE POLICY audit_read_entity ON audit.audit_log FOR SELECT USING (
  core.current_scope() = 'entity' AND entity_id IS NOT NULL AND core.can_access_entity(entity_id));

-- A request's history: entries about the request, or about its employees, files and messages.
CREATE INDEX audit_log_request_idx ON audit.audit_log ((details ->> 'requestId'), at)
  WHERE details ? 'requestId';
