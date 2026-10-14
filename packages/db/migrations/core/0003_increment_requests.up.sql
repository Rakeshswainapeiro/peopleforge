-- 0003 — Increment requests: drafts with employees and proposed increments (R1-02, slice S2).
-- Criteria results (R1-03) and evidence (R1-04) follow in later migrations.
-- Data dictionary: docs/database/core-schema.md. Amounts are encrypted in the API (ADR-008).

-- Lets a request line reference (employee, entity) together, so the database itself refuses an
-- employee from another subsidiary (composite foreign key below).
CREATE UNIQUE INDEX employee_id_entity_uidx ON core.employee (id, entity_id);

-- Per-cycle counter behind human references like INC-2026-0001. Not entity data: a number only.
CREATE TABLE increments.request_sequence (
  cycle_id uuid PRIMARY KEY REFERENCES core.increment_cycle (id),
  last_number integer NOT NULL CHECK (last_number > 0)
);

CREATE TABLE increments.increment_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE CHECK (reference ~ '^INC-[0-9]{4}-[0-9]{4,}$'),
  entity_id uuid NOT NULL REFERENCES core.entity (id),
  cycle_id uuid NOT NULL REFERENCES core.increment_cycle (id),
  -- The criteria version in force when the request was created; later changes don't affect it.
  criteria_set_id uuid NOT NULL REFERENCES increments.criteria_set (id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  UNIQUE (id, entity_id)
);
CREATE INDEX increment_request_entity_cycle_idx
  ON increments.increment_request (entity_id, cycle_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

-- One employee in a request. Grade and salary are a snapshot taken when the employee was added.
CREATE TABLE increments.request_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  employee_number text NOT NULL,
  full_name text NOT NULL,
  grade text NOT NULL,
  current_salary bytea NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  proposed_kind text CHECK (proposed_kind IN ('percent', 'amount')),
  proposed_value bytea,
  -- clock_timestamp, not now(): lines added in one transaction keep the order they were added.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  deleted_at timestamptz,
  FOREIGN KEY (request_id, entity_id) REFERENCES increments.increment_request (id, entity_id),
  FOREIGN KEY (employee_id, entity_id) REFERENCES core.employee (id, entity_id),
  CHECK ((proposed_kind IS NULL) = (proposed_value IS NULL))
);
-- An employee appears once per request (removed lines don't count).
CREATE UNIQUE INDEX request_line_employee_uidx
  ON increments.request_line (request_id, employee_id) WHERE deleted_at IS NULL;
CREATE INDEX request_line_entity_idx ON increments.request_line (entity_id);

-- Idempotency keys for create (a double click or a retried request returns the same draft).
-- The key is claimed first in the creating transaction, so the foreign key is checked at commit.
CREATE TABLE increments.idempotency_key (
  user_id text NOT NULL,
  key text NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
  request_id uuid NOT NULL REFERENCES increments.increment_request (id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE increments.increment_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.increment_request FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON increments.increment_request
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

ALTER TABLE increments.request_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.request_line FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON increments.request_line
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

ALTER TABLE increments.idempotency_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE increments.idempotency_key FORCE ROW LEVEL SECURITY;
CREATE POLICY own_keys ON increments.idempotency_key
  USING (core.current_user_id() <> '' AND user_id = core.current_user_id())
  WITH CHECK (core.current_user_id() <> '' AND user_id = core.current_user_id());

-- Business rows are soft-deleted, so still no DELETE for the app role.
GRANT SELECT, INSERT, UPDATE ON increments.increment_request, increments.request_line,
  increments.request_sequence TO {{APP_ROLE}};
GRANT SELECT, INSERT ON increments.idempotency_key TO {{APP_ROLE}};
