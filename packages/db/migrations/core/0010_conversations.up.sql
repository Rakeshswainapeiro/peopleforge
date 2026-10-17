-- 0010 — Questions and answers per employee between Sirius HR and the subsidiary (R1-08,
-- "back-and-forth"). Slice S5b. Data dictionary: docs/database/core-schema.md. Message text is
-- encrypted in the API (ADR-008).

CREATE TABLE increments.line_message (
  id uuid PRIMARY KEY,
  line_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  request_id uuid NOT NULL,
  -- Who wrote it: Sirius HR or the subsidiary. Decides who has to answer next.
  side text NOT NULL CHECK (side IN ('sirius', 'subsidiary')),
  author_id text NOT NULL,
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 200),
  -- Ciphertext of the message (≤ 2,000 characters before encryption).
  body bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (line_id, entity_id) REFERENCES increments.request_line (id, entity_id),
  FOREIGN KEY (request_id, entity_id) REFERENCES increments.increment_request (id, entity_id)
);
CREATE INDEX line_message_line_idx ON increments.line_message (line_id, created_at);
CREATE INDEX line_message_entity_idx ON increments.line_message (entity_id, created_at DESC);
CREATE INDEX line_message_request_idx ON increments.line_message (request_id, created_at);
-- A conversation is a record of what was asked and answered: never edited or deleted.
CREATE TRIGGER line_message_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON increments.line_message
  FOR EACH STATEMENT EXECUTE FUNCTION audit.refuse_change();

ALTER TABLE increments.line_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.line_message FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON increments.line_message
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

GRANT SELECT, INSERT ON increments.line_message TO {{APP_ROLE}};
