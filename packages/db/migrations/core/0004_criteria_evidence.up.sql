-- 0004 — Per-employee criterion results (R1-03, R1-06) and evidence files (R1-04), slice S3.
-- Data dictionary: docs/database/core-schema.md. Justifications are encrypted in the API
-- (ADR-008): they can describe appraisals, disciplinary records or pay. Evidence content lives in
-- private object storage (ADR-010); only its metadata is here.

-- Lets results and evidence reference (line, entity) together, so the database itself refuses a
-- row whose entity differs from its line's (composite foreign keys below).
ALTER TABLE increments.request_line ADD CONSTRAINT request_line_id_entity_key UNIQUE (id, entity_id);

-- One row per employee line and criterion, created on first save. No row = not yet assessed.
CREATE TABLE increments.criterion_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  criterion_id uuid NOT NULL REFERENCES increments.criterion (id),
  -- NULL: not decided yet (a justification may already be drafted).
  result text CHECK (result IN ('pass', 'fail')),
  -- Ciphertext of the justification (≤ 2,000 characters, checked in the API); NULL when empty.
  justification bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  FOREIGN KEY (line_id, entity_id) REFERENCES increments.request_line (id, entity_id),
  UNIQUE (line_id, criterion_id)
);
CREATE INDEX criterion_result_entity_idx ON increments.criterion_result (entity_id);

-- A file supporting one criterion for one employee. Only files that passed the malware scan are
-- recorded: an infected or unscanned file is never stored. Removal is a soft delete.
CREATE TABLE increments.evidence_file (
  id uuid PRIMARY KEY,
  line_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  criterion_id uuid NOT NULL REFERENCES increments.criterion (id),
  -- Random, server-generated (evidence/<entity>/<id>): never derived from the uploaded name.
  object_key text NOT NULL UNIQUE CHECK (object_key ~ '^evidence/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  -- Display name only, sanitised (no paths, controls or quotes).
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 150),
  -- Detected from the content (magic bytes), never the browser's claim.
  media_type text NOT NULL CHECK (char_length(media_type) BETWEEN 3 AND 127),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 52428800),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  scan_engine text NOT NULL,
  scanned_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  deleted_at timestamptz,
  deleted_by text,
  FOREIGN KEY (line_id, entity_id) REFERENCES increments.request_line (id, entity_id),
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);
-- Files per line and criterion (request view, the 5-file limit).
CREATE INDEX evidence_file_line_idx
  ON increments.evidence_file (line_id, criterion_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX evidence_file_entity_idx ON increments.evidence_file (entity_id);

ALTER TABLE increments.criterion_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.criterion_result FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON increments.criterion_result
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

ALTER TABLE increments.evidence_file ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.evidence_file FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON increments.evidence_file
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

-- No DELETE: a result is overwritten in place (its history arrives with the audit trail, R1-15);
-- evidence is soft-deleted so a removed file stays traceable.
GRANT SELECT, INSERT, UPDATE ON increments.criterion_result, increments.evidence_file TO {{APP_ROLE}};
