-- 0001 — Core tables shared by R1, R2 and later phases, and the R1 configuration tables.
-- Row-Level Security model: ADR-002. Data dictionary: docs/database/core-schema.md.

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS increments;

-- Scope of the current transaction, set by withScope() with SET LOCAL semantics. Missing
-- settings mean "nobody": every policy below then denies.
CREATE FUNCTION core.current_scope() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.scope', true), '') $$;

CREATE FUNCTION core.current_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.user_id', true), '') $$;

CREATE FUNCTION core.can_access_entity(target uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT core.current_scope() = 'group'
        OR (core.current_scope() = 'entity'
            AND target = ANY (string_to_array(nullif(current_setting('app.entity_ids', true), ''), ',')::uuid[]))
  $$;

-- Subsidiaries (and Sirius itself, if it ever submits). R1-01, R2-12.
CREATE TABLE core.entity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  name jsonb NOT NULL CHECK (jsonb_typeof(name -> 'en') = 'string'),
  default_currency char(3) NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

-- Which subsidiaries a Subsidiary HR user acts for (Entra object ID → entity). ADR-002 §4.
CREATE TABLE core.user_entity (
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 128),
  entity_id uuid NOT NULL REFERENCES core.entity (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  PRIMARY KEY (user_id, entity_id)
);
CREATE INDEX user_entity_entity_idx ON core.user_entity (entity_id);

-- Increment cycles (Q1: requests belong to a cycle, e.g. "Increment cycle 2026"). Configuration.
CREATE TABLE core.increment_cycle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name jsonb NOT NULL CHECK (jsonb_typeof(name -> 'en') = 'string'),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  submission_deadline date,
  status text NOT NULL CHECK (status IN ('planned', 'open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  CHECK (ends_on >= starts_on),
  CHECK (submission_deadline IS NULL OR submission_deadline BETWEEN starts_on AND ends_on)
);

-- Interim employee directory per subsidiary (Q2 assumption): source of grade and salary for
-- increment requests until R2 employee records replace it. Salary is encrypted (ADR-008).
CREATE TABLE core.employee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES core.entity (id),
  employee_number text NOT NULL CHECK (length(employee_number) BETWEEN 1 AND 40),
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 1 AND 200),
  grade text NOT NULL CHECK (length(grade) BETWEEN 1 AND 20),
  monthly_salary bytea NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX employee_entity_number_uidx ON core.employee (entity_id, employee_number)
  WHERE deleted_at IS NULL;
CREATE INDEX employee_entity_name_idx ON core.employee (entity_id, lower(full_name));

-- Versioned eligibility criteria (R1-05, NFR-CFG-01). A request pins the set active when created.
CREATE TABLE increments.criteria_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);
-- At most one active set.
CREATE UNIQUE INDEX criteria_set_one_active_uidx ON increments.criteria_set (status)
  WHERE status = 'active';

CREATE TABLE increments.criterion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria_set_id uuid NOT NULL REFERENCES increments.criteria_set (id),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  code text NOT NULL CHECK (code ~ '^C[0-9]{1,2}$'),
  name jsonb NOT NULL CHECK (jsonb_typeof(name -> 'en') = 'string'),
  description jsonb NOT NULL CHECK (jsonb_typeof(description -> 'en') = 'string'),
  justification_required boolean NOT NULL DEFAULT true,
  evidence_policy text NOT NULL CHECK (evidence_policy IN ('required', 'optional', 'none')),
  allowed_media_types text[] NOT NULL DEFAULT '{}',
  max_file_mb integer NOT NULL DEFAULT 10 CHECK (max_file_mb BETWEEN 1 AND 50),
  pass_rule jsonb NOT NULL DEFAULT '{"kind": "manual"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  UNIQUE (criteria_set_id, position),
  UNIQUE (criteria_set_id, code)
);

-- Row-Level Security: entity-scoped tables. FORCE so the owner is bound too.
ALTER TABLE core.entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.entity FORCE ROW LEVEL SECURITY;
-- Subsidiary users may read their own entity; only group scope (Sirius admins) creates or edits.
CREATE POLICY entity_read ON core.entity FOR SELECT
  USING (core.can_access_entity(id));
CREATE POLICY entity_manage ON core.entity FOR ALL
  USING (core.current_scope() = 'group') WITH CHECK (core.current_scope() = 'group');

ALTER TABLE core.user_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.user_entity FORCE ROW LEVEL SECURITY;
-- A user may read their own assignments (to resolve their scope); only group scope manages them.
CREATE POLICY user_entity_read ON core.user_entity FOR SELECT
  USING (core.current_scope() = 'group' OR (core.current_user_id() <> '' AND user_id = core.current_user_id()));
CREATE POLICY user_entity_manage ON core.user_entity FOR ALL
  USING (core.current_scope() = 'group') WITH CHECK (core.current_scope() = 'group');

ALTER TABLE core.employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.employee FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON core.employee
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

-- Least privilege for the app role: data access only, soft delete for business rows (no DELETE).
GRANT USAGE ON SCHEMA core, increments TO {{APP_ROLE}};
GRANT SELECT, INSERT, UPDATE ON core.entity, core.increment_cycle, core.employee,
  increments.criteria_set, increments.criterion TO {{APP_ROLE}};
GRANT SELECT, INSERT, DELETE ON core.user_entity TO {{APP_ROLE}};
