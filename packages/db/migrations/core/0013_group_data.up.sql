-- 0013 — Group-level employee data (R2-01 … R2-04, R2-08, R2-12 … R2-14). Slice S8.
-- Data dictionary: docs/database/groupdata-schema.md. ADR-015.

CREATE SCHEMA IF NOT EXISTS groupdata;

-- The field template every upload is checked against (R2-02), versioned like the criteria:
-- an upload records the version it was checked with. Configuration (NFR-CFG-01).
CREATE TABLE groupdata.field_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);
CREATE UNIQUE INDEX field_template_one_active_uidx ON groupdata.field_template (status)
  WHERE status = 'active';

CREATE TABLE groupdata.template_field (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES groupdata.field_template (id),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 60),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label jsonb NOT NULL CHECK (jsonb_typeof(label -> 'en') = 'string'),
  type text NOT NULL CHECK (type IN ('text', 'date', 'decimal', 'enum')),
  required boolean NOT NULL,
  core boolean NOT NULL,
  allowed_values text[] NOT NULL DEFAULT '{}',
  palm_hr_field text CHECK (char_length(palm_hr_field) BETWEEN 1 AND 60),
  UNIQUE (template_id, key),
  UNIQUE (template_id, position)
);

-- Placeholder template (BRD A3 pending): clearly marked, changed by admins on Settings.
INSERT INTO groupdata.field_template (id, version, status, activated_at, created_by, updated_by)
VALUES ('00000000-0000-4000-8000-0000000f7e01', 1, 'active', now(), 'migration:0013', 'migration:0013');
INSERT INTO groupdata.template_field
  (template_id, position, key, label, type, required, core, allowed_values, palm_hr_field)
SELECT '00000000-0000-4000-8000-0000000f7e01', f.position, f.key, jsonb_build_object('en', f.label),
       f.type, f.required, true, f.allowed, NULL
FROM (VALUES
  (1, 'employee_number', 'Employee ID', 'text', true, '{}'::text[]),
  (2, 'full_name', 'Full name', 'text', true, '{}'),
  (3, 'department', 'Department', 'text', true, '{}'),
  (4, 'designation', 'Designation', 'text', true, '{}'),
  (5, 'grade', 'Grade', 'text', true, '{}'),
  (6, 'gross_salary', 'Gross monthly salary', 'decimal', true, '{}'),
  (7, 'basic_salary', 'Basic monthly salary', 'decimal', false, '{}'),
  (8, 'currency', 'Currency', 'text', true, '{}'),
  (9, 'date_joined', 'Date of joining', 'date', true, '{}'),
  (10, 'date_of_birth', 'Date of birth', 'date', true, '{}'),
  (11, 'gender', 'Gender', 'enum', true, '{female,male}'),
  (12, 'nationality', 'Nationality', 'text', false, '{}'),
  (13, 'status', 'Employment status', 'enum', true, '{active,on_leave,left}'),
  (14, 'date_left', 'Leaving date', 'date', false, '{}'),
  (15, 'cost_centre', 'Cost centre', 'text', false, '{}')
) AS f(position, key, label, type, required, allowed);

-- Salary bands per grade (D5/D6 salary bands, anomaly rule ANM-06). Placeholders (Figma
-- values); configuration.
CREATE TABLE groupdata.grade_band (
  grade text PRIMARY KEY CHECK (char_length(grade) BETWEEN 1 AND 20),
  position smallint NOT NULL UNIQUE,
  min_salary numeric(12, 2) NOT NULL CHECK (min_salary >= 0),
  max_salary numeric(12, 2) NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CHECK (max_salary > min_salary)
);
INSERT INTO groupdata.grade_band (grade, position, min_salary, max_salary, currency, updated_by) VALUES
  ('G1', 1, 4000, 6500, 'AED', 'migration:0013'),
  ('G2', 2, 6500, 9500, 'AED', 'migration:0013'),
  ('G3', 3, 9500, 14000, 'AED', 'migration:0013'),
  ('G4', 4, 14000, 20000, 'AED', 'migration:0013'),
  ('G5', 5, 20000, 28000, 'AED', 'migration:0013'),
  ('G6', 6, 28000, 40000, 'AED', 'migration:0013'),
  ('G7', 7, 40000, 60000, 'AED', 'migration:0013');

-- "UP-0907": one number per upload across the group.
CREATE SEQUENCE groupdata.upload_number_seq START 1;

-- Every file a subsidiary uploaded (R2-01, R2-08): rejected ones too, with their issues. An
-- accepted upload is the version in use until a later one for the same period supersedes it.
CREATE TABLE groupdata.upload (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE CHECK (reference ~ '^UP-[0-9]{4,}$'),
  entity_id uuid NOT NULL REFERENCES core.entity (id),
  period date NOT NULL CHECK (extract(day FROM period) = 1),
  version integer CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('rejected', 'accepted', 'superseded')),
  template_id uuid NOT NULL REFERENCES groupdata.field_template (id),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 150),
  object_key text NOT NULL UNIQUE,
  media_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  scan_engine text NOT NULL,
  rows integer NOT NULL CHECK (rows >= 0),
  errors integer NOT NULL CHECK (errors >= 0),
  warnings integer NOT NULL CHECK (warnings >= 0),
  -- [{row, field, code, severity}], capped; codes only, never cell values.
  issues jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(issues) = 'array'),
  -- Comparison with the previous period (R2-09); counts and percentages, no pay.
  comparison jsonb,
  flags integer NOT NULL DEFAULT 0 CHECK (flags >= 0),
  uploaded_by text NOT NULL,
  uploaded_by_name text NOT NULL CHECK (char_length(uploaded_by_name) BETWEEN 1 AND 200),
  uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, entity_id),
  UNIQUE (entity_id, period, version),
  CHECK ((status = 'rejected') = (version IS NULL)),
  CHECK (status <> 'rejected' OR errors > 0)
);
CREATE INDEX upload_entity_period_idx ON groupdata.upload (entity_id, period, uploaded_at DESC);
CREATE INDEX upload_period_idx ON groupdata.upload (period, uploaded_at DESC);

-- One row per employee per accepted upload (R2-04): never changed or deleted, so every
-- version stays. Partitioned by period (high growth). Salaries are encrypted (ADR-008).
CREATE TABLE groupdata.employee_snapshot (
  id uuid NOT NULL,
  upload_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  period date NOT NULL,
  row_number integer NOT NULL CHECK (row_number >= 2),
  employee_number text NOT NULL CHECK (char_length(employee_number) BETWEEN 1 AND 40),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 200),
  department text NOT NULL CHECK (char_length(department) BETWEEN 1 AND 80),
  designation text CHECK (char_length(designation) BETWEEN 1 AND 120),
  grade text NOT NULL CHECK (char_length(grade) BETWEEN 1 AND 20),
  gross_salary bytea NOT NULL,
  basic_salary bytea,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  date_joined date NOT NULL,
  date_of_birth date,
  gender text NOT NULL CHECK (char_length(gender) BETWEEN 1 AND 20),
  nationality text CHECK (char_length(nationality) BETWEEN 1 AND 60),
  status text NOT NULL CHECK (char_length(status) BETWEEN 1 AND 20),
  date_left date,
  cost_centre text CHECK (char_length(cost_centre) BETWEEN 1 AND 60),
  -- Fields the admin added to the template, as text.
  extra jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(extra) = 'object'),
  PRIMARY KEY (period, id),
  UNIQUE (period, upload_id, employee_number),
  FOREIGN KEY (upload_id, entity_id) REFERENCES groupdata.upload (id, entity_id)
) PARTITION BY RANGE (period);
CREATE TABLE groupdata.employee_snapshot_y2024 PARTITION OF groupdata.employee_snapshot
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE groupdata.employee_snapshot_y2025 PARTITION OF groupdata.employee_snapshot
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE groupdata.employee_snapshot_y2026 PARTITION OF groupdata.employee_snapshot
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE groupdata.employee_snapshot_y2027 PARTITION OF groupdata.employee_snapshot
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE groupdata.employee_snapshot_y2028 PARTITION OF groupdata.employee_snapshot
  FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');
-- Any other year still lands somewhere; DEPLOYMENT.md says to add the next year's partition.
CREATE TABLE groupdata.employee_snapshot_other PARTITION OF groupdata.employee_snapshot DEFAULT;
CREATE INDEX employee_snapshot_upload_idx ON groupdata.employee_snapshot (upload_id);
CREATE INDEX employee_snapshot_employee_idx
  ON groupdata.employee_snapshot (entity_id, employee_number, period);
CREATE TRIGGER employee_snapshot_append_only BEFORE UPDATE OR DELETE ON groupdata.employee_snapshot
  FOR EACH ROW EXECUTE FUNCTION audit.refuse_change();

-- Which accepted upload is in use for a subsidiary and month: the single source of truth
-- (R2-04). Moves to each new version; earlier versions stay readable.
CREATE TABLE groupdata.period_version (
  entity_id uuid NOT NULL REFERENCES core.entity (id),
  period date NOT NULL CHECK (extract(day FROM period) = 1),
  upload_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  accepted_at timestamptz NOT NULL,
  PRIMARY KEY (entity_id, period),
  FOREIGN KEY (upload_id, entity_id) REFERENCES groupdata.upload (id, entity_id)
);
CREATE INDEX period_version_period_idx ON groupdata.period_version (period);

-- Per subsidiary, month and department: the figures the dashboards read (NFR-PERF-01),
-- rebuilt with each accepted version. A derived cache: always recomputable from snapshots.
CREATE TABLE groupdata.period_summary (
  entity_id uuid NOT NULL REFERENCES core.entity (id),
  period date NOT NULL CHECK (extract(day FROM period) = 1),
  department text NOT NULL CHECK (char_length(department) BETWEEN 1 AND 80),
  upload_id uuid NOT NULL,
  metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  PRIMARY KEY (entity_id, period, department),
  FOREIGN KEY (upload_id, entity_id) REFERENCES groupdata.upload (id, entity_id)
);
CREATE INDEX period_summary_period_idx ON groupdata.period_summary (period);

-- Row-Level Security: a subsidiary only ever sees its own uploads and records (R2-12).
ALTER TABLE groupdata.upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE groupdata.upload FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON groupdata.upload
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));
ALTER TABLE groupdata.employee_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE groupdata.employee_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON groupdata.employee_snapshot
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));
ALTER TABLE groupdata.period_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE groupdata.period_version FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON groupdata.period_version
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));
ALTER TABLE groupdata.period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE groupdata.period_summary FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON groupdata.period_summary
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

-- Group configuration: everyone reads it (to fill in the template); only Sirius (group scope)
-- changes it. The API checks the permission too; this holds if a check is ever missed.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['field_template', 'template_field', 'grade_band'] LOOP
    EXECUTE format('ALTER TABLE groupdata.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE groupdata.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY read_all ON groupdata.%I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY group_insert ON groupdata.%I FOR INSERT
                      WITH CHECK (core.current_scope() = ''group'')', t);
    EXECUTE format('CREATE POLICY group_update ON groupdata.%I FOR UPDATE
                      USING (core.current_scope() = ''group'') WITH CHECK (core.current_scope() = ''group'')', t);
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA groupdata TO {{APP_ROLE}};
GRANT SELECT, INSERT, UPDATE ON groupdata.field_template, groupdata.template_field,
  groupdata.grade_band TO {{APP_ROLE}};
GRANT USAGE ON SEQUENCE groupdata.upload_number_seq TO {{APP_ROLE}};
-- Uploads: only the status moves (accepted → superseded) and the flag count (S9).
GRANT SELECT, INSERT ON groupdata.upload TO {{APP_ROLE}};
GRANT UPDATE (status, flags) ON groupdata.upload TO {{APP_ROLE}};
GRANT SELECT, INSERT ON groupdata.employee_snapshot TO {{APP_ROLE}};
GRANT SELECT, INSERT, UPDATE ON groupdata.period_version TO {{APP_ROLE}};
GRANT SELECT, INSERT, DELETE ON groupdata.period_summary TO {{APP_ROLE}};
