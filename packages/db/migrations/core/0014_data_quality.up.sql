-- 0014 — Data quality (R2-09 … R2-11): anomaly rules, flags with owner, status and resolution,
-- and reminders for missing uploads and open flags. Slice S9. ADR-015.

-- The rules, as configuration (R2-10, NFR-CFG-01): placeholders to confirm with Sirius HR.
-- `threshold` means: percent for changes, months for ANM-04, percent tolerance for ANM-05.
CREATE TABLE groupdata.anomaly_rule (
  code text PRIMARY KEY CHECK (code ~ '^ANM-[0-9]{2}$'),
  kind text NOT NULL UNIQUE CHECK (kind IN (
    'missing_employee', 'grade_change', 'salary_change', 'salary_stable_then_changed',
    'increment_mismatch', 'outside_grade_band', 'duplicate_across_entities',
    'headcount_change', 'payroll_change')),
  threshold numeric(6, 2) CHECK (threshold > 0),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  updated_by_name text CHECK (char_length(updated_by_name) BETWEEN 1 AND 200)
);
INSERT INTO groupdata.anomaly_rule (code, kind, threshold, updated_by) VALUES
  ('ANM-01', 'missing_employee', NULL, 'migration:0014'),
  ('ANM-02', 'grade_change', NULL, 'migration:0014'),
  ('ANM-03', 'salary_change', 20, 'migration:0014'),
  ('ANM-04', 'salary_stable_then_changed', 12, 'migration:0014'),
  ('ANM-05', 'increment_mismatch', 1, 'migration:0014'),
  ('ANM-06', 'outside_grade_band', NULL, 'migration:0014'),
  ('ANM-07', 'duplicate_across_entities', NULL, 'migration:0014'),
  ('ANM-08', 'headcount_change', 10, 'migration:0014'),
  ('ANM-09', 'payroll_change', 10, 'migration:0014');

CREATE SEQUENCE groupdata.flag_number_seq START 1;

-- A flagged record (or subsidiary, ANM-08/09) of an accepted upload (R2-10, R2-11). `detail`
-- holds the before/after values shown on the flag (they can be pay), encrypted (ADR-008), as
-- is the resolution note.
CREATE TABLE groupdata.anomaly_flag (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE CHECK (reference ~ '^AN-[0-9]{4,}$'),
  entity_id uuid NOT NULL REFERENCES core.entity (id),
  period date NOT NULL CHECK (extract(day FROM period) = 1),
  upload_id uuid NOT NULL,
  rule_code text NOT NULL REFERENCES groupdata.anomaly_rule (code),
  employee_number text CHECK (char_length(employee_number) BETWEEN 1 AND 40),
  employee_name text CHECK (char_length(employee_name) BETWEEN 1 AND 200),
  field text CHECK (char_length(field) BETWEEN 1 AND 40),
  detail bytea NOT NULL,
  owner_id text NOT NULL,
  owner_name text NOT NULL CHECK (char_length(owner_name) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolution_note bytea,
  -- Set when the system closed it: the upload it came from was replaced by a new version.
  resolved_reason text CHECK (resolved_reason IN ('superseded')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  FOREIGN KEY (upload_id, entity_id) REFERENCES groupdata.upload (id, entity_id),
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE INDEX anomaly_flag_entity_period_idx
  ON groupdata.anomaly_flag (entity_id, period, status);
CREATE INDEX anomaly_flag_period_idx ON groupdata.anomaly_flag (period, status);
CREATE INDEX anomaly_flag_upload_idx ON groupdata.anomaly_flag (upload_id);
CREATE INDEX anomaly_flag_owner_idx ON groupdata.anomaly_flag (owner_id, status);

ALTER TABLE groupdata.anomaly_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE groupdata.anomaly_flag FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON groupdata.anomaly_flag
  USING (core.can_access_entity(entity_id)) WITH CHECK (core.can_access_entity(entity_id));

ALTER TABLE groupdata.anomaly_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE groupdata.anomaly_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY read_all ON groupdata.anomaly_rule FOR SELECT USING (true);
CREATE POLICY group_update ON groupdata.anomaly_rule FOR UPDATE
  USING (core.current_scope() = 'group') WITH CHECK (core.current_scope() = 'group');

GRANT SELECT, UPDATE (threshold, enabled, updated_at, updated_by, updated_by_name)
  ON groupdata.anomaly_rule TO {{APP_ROLE}};
GRANT USAGE ON SEQUENCE groupdata.flag_number_seq TO {{APP_ROLE}};
GRANT SELECT, INSERT ON groupdata.anomaly_flag TO {{APP_ROLE}};
GRANT UPDATE (owner_id, owner_name, status, resolution_note, resolved_reason, updated_at, resolved_at)
  ON groupdata.anomaly_flag TO {{APP_ROLE}};

-- Duplicate employee IDs across subsidiaries (ANM-07): an uploader can't read other
-- subsidiaries' records (RLS), so this answers only "which of these IDs exist elsewhere in this
-- month", nothing else.
CREATE FUNCTION groupdata.employee_numbers_elsewhere(p_entity uuid, p_period date, p_numbers text[])
  RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  -- RLS binds the owner too: look across subsidiaries for this one query, then put the
  -- caller's scope back, so the caller's transaction is never widened.
  previous text := coalesce(current_setting('app.scope', true), '');
  found text[];
BEGIN
  PERFORM set_config('app.scope', 'group', true);
  SELECT coalesce(array_agg(DISTINCT s.employee_number), '{}') INTO found
    FROM groupdata.employee_snapshot s
    JOIN groupdata.period_version v
      ON v.upload_id = s.upload_id AND v.entity_id = s.entity_id AND v.period = s.period
   WHERE s.period = p_period AND s.entity_id <> p_entity AND s.employee_number = ANY (p_numbers);
  PERFORM set_config('app.scope', previous, true);
  RETURN found;
END
$$;
REVOKE ALL ON FUNCTION groupdata.employee_numbers_elsewhere(uuid, date, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION groupdata.employee_numbers_elsewhere(uuid, date, text[]) TO {{APP_ROLE}};

-- Reminders (R2-11) on the S7 triggers: a subsidiary hasn't uploaded last month's data N days
-- after month end; a flag has stayed open N days.
ALTER TABLE notify.reminder_rule DROP CONSTRAINT reminder_rule_kind_check;
ALTER TABLE notify.reminder_rule ADD CONSTRAINT reminder_rule_kind_check CHECK (kind IN (
  'review_overdue', 'return_overdue', 'deadline_approaching', 'upload_due', 'flag_open'));
INSERT INTO notify.reminder_rule (kind, days, updated_by) VALUES
  ('upload_due', 5, 'migration:0014'),
  ('flag_open', 5, 'migration:0014');

/*
 * Group-data reminders, like notify.queue_reminders() (ADR-014): SECURITY DEFINER, no
 * arguments, EXECUTE for the worker role only, each reminder once (notify.reminder_log).
 * upload_due goes to every subsidiary HR user assigned to the subsidiary; flag_open to the
 * flag's owner.
 */
CREATE FUNCTION notify.queue_group_reminders() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  queued integer := 0;
  added integer;
  rule record;
  today date := (now() AT TIME ZONE 'Asia/Dubai')::date;
  last_month date := date_trunc('month', (now() AT TIME ZONE 'Asia/Dubai')::date)::date - interval '1 month';
BEGIN
  PERFORM set_config('app.scope', 'group', true);
  PERFORM set_config('app.user_id', 'system:reminders', true);
  FOR rule IN SELECT kind, days FROM notify.reminder_rule
               WHERE enabled AND kind IN ('upload_due', 'flag_open') LOOP
    IF rule.kind = 'upload_due' THEN
      -- Due once last month has ended plus `days` (e.g. the 5th for September's data).
      CONTINUE WHEN today < (last_month + interval '1 month')::date + rule.days;
      WITH due AS (
        SELECT e.id AS entity_id, e.code, ue.user_id
          FROM core.entity e
          JOIN core.user_entity ue ON ue.entity_id = e.id
         WHERE NOT EXISTS (SELECT 1 FROM groupdata.period_version v
                            WHERE v.entity_id = e.id AND v.period = last_month)
      ), claimed AS (
        INSERT INTO notify.reminder_log (kind, subject_id, due_key)
        SELECT rule.kind, entity_id, last_month::text || ':' || user_id FROM due
        ON CONFLICT DO NOTHING
        RETURNING subject_id, due_key, gen_random_uuid() AS notification_id
      ), created AS (
        INSERT INTO notify.notification
          (id, recipient_user_id, entity_id, request_id, kind, params, action_needed)
        SELECT c.notification_id, d.user_id, d.entity_id, NULL, rule.kind,
               jsonb_build_object('entity', d.code, 'period', to_char(last_month, 'YYYY-MM'),
                                  'days', rule.days), true
          FROM claimed c
          JOIN due d ON d.entity_id = c.subject_id AND c.due_key = last_month::text || ':' || d.user_id
      )
      INSERT INTO notify.email_outbox (notification_id) SELECT notification_id FROM claimed;
      GET DIAGNOSTICS added = ROW_COUNT;
      queued := queued + added;
    ELSIF rule.kind = 'flag_open' THEN
      WITH due AS (
        SELECT f.id, f.entity_id, f.reference, f.owner_id, e.code
          FROM groupdata.anomaly_flag f
          JOIN core.entity e ON e.id = f.entity_id
         WHERE f.status <> 'resolved'
           AND f.created_at < now() - make_interval(days => rule.days)
      ), claimed AS (
        INSERT INTO notify.reminder_log (kind, subject_id, due_key)
        SELECT rule.kind, id, owner_id FROM due
        ON CONFLICT DO NOTHING
        RETURNING subject_id, gen_random_uuid() AS notification_id
      ), created AS (
        INSERT INTO notify.notification
          (id, recipient_user_id, entity_id, request_id, kind, params, action_needed)
        SELECT c.notification_id, d.owner_id, d.entity_id, NULL, rule.kind,
               jsonb_build_object('flag', d.reference, 'flagId', d.id::text, 'entity', d.code,
                                  'days', rule.days), true
          FROM claimed c JOIN due d ON d.id = c.subject_id
      )
      INSERT INTO notify.email_outbox (notification_id) SELECT notification_id FROM claimed;
      GET DIAGNOSTICS added = ROW_COUNT;
      queued := queued + added;
    END IF;
  END LOOP;
  RETURN queued;
END
$$;
REVOKE ALL ON FUNCTION notify.queue_group_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify.queue_group_reminders() TO {{WORKER_ROLE}};
