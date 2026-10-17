-- 0009 — Sirius HR's review (R1-07, R1-08, R1-09, R1-10): per-criterion verification, decisions
-- per employee (approve, reject, return), and the request statuses that follow. Slice S5a.
-- Data dictionary: docs/database/core-schema.md. Comments and approved values are encrypted in
-- the API (ADR-008).

ALTER TABLE increments.increment_request DROP CONSTRAINT increment_request_status_check;
ALTER TABLE increments.increment_request
  ADD CONSTRAINT increment_request_status_check CHECK (status IN (
    'draft', 'submitted', 'under_review', 'returned', 'approved', 'partly_approved', 'rejected'));
-- When the last employee was decided (the end of the request's TAT, R1-11).
ALTER TABLE increments.increment_request ADD COLUMN decided_at timestamptz;
ALTER TABLE increments.increment_request ADD CONSTRAINT increment_request_decided_check
  CHECK ((status IN ('approved', 'partly_approved', 'rejected')) = (decided_at IS NOT NULL));

-- Where each employee stands in the review. A returned employee is the subsidiary's to fix and
-- resubmit; approved and rejected are final.
ALTER TABLE increments.request_line
  ADD COLUMN review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'returned')),
  ADD COLUMN review_changed_at timestamptz;

-- Sirius HR's check of one criterion for one employee ("Mark verified"). Removing the check
-- deletes the row; both are audited. Its time is the criterion's TAT end (R1-11).
CREATE TABLE increments.criterion_verification (
  line_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  criterion_id uuid NOT NULL REFERENCES increments.criterion (id),
  verified_by text NOT NULL,
  verified_by_name text NOT NULL CHECK (char_length(verified_by_name) BETWEEN 1 AND 200),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (line_id, criterion_id),
  FOREIGN KEY (line_id, entity_id) REFERENCES increments.request_line (id, entity_id)
);
CREATE INDEX criterion_verification_entity_idx ON increments.criterion_verification (entity_id);

-- Every decision on an employee, in order (a returned employee can later be approved). The
-- latest is the current one. Append-only, like the status history.
CREATE TABLE increments.line_decision (
  id uuid PRIMARY KEY,
  line_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  request_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'returned')),
  -- From a fixed list per decision (contracts); required for reject and return, and for an
  -- approval that changes the proposed increment.
  reason_code text CHECK (reason_code ~ '^[a-z_]{1,40}$'),
  -- Ciphertext of the reviewer's comment; NULL when none.
  comment bytea,
  -- An approval at a different increment than proposed (ciphertext of a decimal); NULL = as proposed.
  approved_kind text CHECK (approved_kind IN ('percent', 'amount')),
  approved_value bytea,
  decided_by text NOT NULL,
  decided_by_name text NOT NULL CHECK (char_length(decided_by_name) BETWEEN 1 AND 200),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (line_id, entity_id) REFERENCES increments.request_line (id, entity_id),
  FOREIGN KEY (request_id, entity_id) REFERENCES increments.increment_request (id, entity_id),
  CHECK ((approved_kind IS NULL) = (approved_value IS NULL)),
  CHECK (decision = 'approved' OR approved_kind IS NULL),
  CHECK (decision = 'approved' OR reason_code IS NOT NULL)
);
CREATE INDEX line_decision_line_idx ON increments.line_decision (line_id, decided_at DESC);
CREATE INDEX line_decision_request_idx ON increments.line_decision (request_id, decided_at);
CREATE INDEX line_decision_entity_idx ON increments.line_decision (entity_id, decided_at);
CREATE TRIGGER line_decision_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON increments.line_decision
  FOR EACH STATEMENT EXECUTE FUNCTION audit.refuse_change();

-- The review queue lists employees by review status across requests.
CREATE INDEX request_line_review_idx
  ON increments.request_line (review_status, request_id) WHERE deleted_at IS NULL;

ALTER TABLE increments.criterion_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.criterion_verification FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON increments.criterion_verification
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

ALTER TABLE increments.line_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.line_decision FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON increments.line_decision
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

-- Verifications are removed when unticked or when a returned employee is resubmitted.
GRANT SELECT, INSERT, DELETE ON increments.criterion_verification TO {{APP_ROLE}};
GRANT SELECT, INSERT ON increments.line_decision TO {{APP_ROLE}};
