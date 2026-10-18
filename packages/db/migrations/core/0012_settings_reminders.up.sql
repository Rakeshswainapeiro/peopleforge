-- 0012 — Reminders on configured triggers (R1-13, NFR-CFG-01) and their settings. Slice S7a.
-- Data dictionary: docs/database/core-schema.md. ADR-014.

-- The triggers, as configuration: admins change the days or turn one off (settings screen).
-- Defaults are S5a/S7 assumptions to confirm with Sirius HR (Q9).
CREATE TABLE notify.reminder_rule (
  kind text PRIMARY KEY
    CHECK (kind IN ('review_overdue', 'return_overdue', 'deadline_approaching')),
  days smallint NOT NULL CHECK (days BETWEEN 1 AND 30),
  enabled boolean NOT NULL DEFAULT true,
  -- Role-addressed reminders go to this role (Sirius HR reviewers); the others to one user.
  recipient_role text CHECK (recipient_role ~ '^[A-Za-z][A-Za-z.]{1,63}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  updated_by_name text CHECK (char_length(updated_by_name) BETWEEN 1 AND 200)
);
INSERT INTO notify.reminder_rule (kind, days, recipient_role, updated_by) VALUES
  ('review_overdue', 2, 'PeopleForge.Reviewer', 'migration:0012'),
  ('return_overdue', 2, NULL, 'migration:0012'),
  ('deadline_approaching', 3, NULL, 'migration:0012');

-- One reminder per episode: a request waiting since a given time, returned at a given time, or
-- a draft before a given deadline. Written only by queue_reminders().
CREATE TABLE notify.reminder_log (
  kind text NOT NULL,
  subject_id uuid NOT NULL,
  due_key text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (kind, subject_id, due_key)
);

/*
 * Queues the reminders that are due now, each once, as notifications with an email (outbox).
 * SECURITY DEFINER so the worker role needs no access to requests: it may only call this. It
 * takes no arguments (nothing a caller could steer: time is now(), recipients come from the
 * requests and the rules). Returns how many reminders were queued. Ages are elapsed days, like
 * the Review queue's "Past reminder"; the deadline compares Dubai calendar dates.
 */
CREATE FUNCTION notify.queue_reminders() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  queued integer := 0;
  added integer;
  rule record;
  today date := (now() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
  -- Row-Level Security binds the owner too (FORCE): act in group scope as the system. IDs are
  -- chosen before inserting: RETURNING a user's notification would need the right to read it.
  PERFORM set_config('app.scope', 'group', true);
  PERFORM set_config('app.user_id', 'system:reminders', true);
  FOR rule IN SELECT kind, days, recipient_role FROM notify.reminder_rule WHERE enabled LOOP
    IF rule.kind = 'review_overdue' AND rule.recipient_role IS NOT NULL THEN
      WITH due AS (
        SELECT r.id, r.entity_id, r.reference, e.code AS entity, count(*)::int AS employees,
               min(coalesce(l.review_changed_at, r.submitted_at)) AS since
        FROM increments.increment_request r
        JOIN increments.request_line l ON l.request_id = r.id AND l.deleted_at IS NULL
        JOIN core.entity e ON e.id = r.entity_id
        WHERE r.deleted_at IS NULL
          AND r.status IN ('submitted', 'under_review', 'returned')
          AND l.review_status = 'pending'
          AND coalesce(l.review_changed_at, r.submitted_at) < now() - make_interval(days => rule.days)
        GROUP BY r.id, r.entity_id, r.reference, e.code
      ), claimed AS (
        INSERT INTO notify.reminder_log (kind, subject_id, due_key)
        SELECT rule.kind, id, extract(epoch FROM since)::text FROM due
        ON CONFLICT DO NOTHING RETURNING subject_id, gen_random_uuid() AS notification_id
      ), created AS (
        INSERT INTO notify.notification
          (id, recipient_role, entity_id, request_id, kind, params, action_needed)
        SELECT c.notification_id, rule.recipient_role, d.entity_id, d.id, rule.kind,
               jsonb_build_object('reference', d.reference, 'entity', d.entity,
                                  'employees', d.employees, 'days', rule.days), true
        FROM due d JOIN claimed c ON c.subject_id = d.id
      )
      INSERT INTO notify.email_outbox (notification_id) SELECT notification_id FROM claimed;
      GET DIAGNOSTICS added = ROW_COUNT;
      queued := queued + added;
    ELSIF rule.kind = 'return_overdue' THEN
      WITH due AS (
        SELECT r.id, r.entity_id, r.reference, r.submitted_by, r.status_changed_at AS since,
               (SELECT count(*)::int FROM increments.request_line l
                 WHERE l.request_id = r.id AND l.deleted_at IS NULL
                   AND l.review_status = 'returned') AS employees
        FROM increments.increment_request r
        WHERE r.deleted_at IS NULL AND r.status = 'returned' AND r.submitted_by IS NOT NULL
          AND r.status_changed_at < now() - make_interval(days => rule.days)
      ), claimed AS (
        INSERT INTO notify.reminder_log (kind, subject_id, due_key)
        SELECT rule.kind, id, extract(epoch FROM since)::text FROM due
        ON CONFLICT DO NOTHING RETURNING subject_id, gen_random_uuid() AS notification_id
      ), created AS (
        INSERT INTO notify.notification
          (id, recipient_user_id, entity_id, request_id, kind, params, action_needed)
        SELECT c.notification_id, d.submitted_by, d.entity_id, d.id, rule.kind,
               jsonb_build_object('reference', d.reference, 'employees', d.employees,
                                  'days', rule.days), true
        FROM due d JOIN claimed c ON c.subject_id = d.id
      )
      INSERT INTO notify.email_outbox (notification_id) SELECT notification_id FROM claimed;
      GET DIAGNOSTICS added = ROW_COUNT;
      queued := queued + added;
    ELSIF rule.kind = 'deadline_approaching' THEN
      WITH due AS (
        SELECT r.id, r.entity_id, r.reference, r.created_by, c.submission_deadline AS deadline,
               (SELECT count(*)::int FROM increments.request_line l
                 WHERE l.request_id = r.id AND l.deleted_at IS NULL) AS employees
        FROM increments.increment_request r
        JOIN core.increment_cycle c ON c.id = r.cycle_id
        WHERE r.deleted_at IS NULL AND r.status = 'draft'
          AND c.submission_deadline IS NOT NULL
          AND today BETWEEN c.submission_deadline - rule.days AND c.submission_deadline
      ), claimed AS (
        INSERT INTO notify.reminder_log (kind, subject_id, due_key)
        SELECT rule.kind, id, deadline::text FROM due
        ON CONFLICT DO NOTHING RETURNING subject_id, gen_random_uuid() AS notification_id
      ), created AS (
        INSERT INTO notify.notification
          (id, recipient_user_id, entity_id, request_id, kind, params, action_needed)
        SELECT c.notification_id, d.created_by, d.entity_id, d.id, rule.kind,
               jsonb_build_object('reference', d.reference, 'employees', d.employees,
                                  'deadline', d.deadline::text,
                                  'days', d.deadline - today), true
        FROM due d JOIN claimed c ON c.subject_id = d.id
      )
      INSERT INTO notify.email_outbox (notification_id) SELECT notification_id FROM claimed;
      GET DIAGNOSTICS added = ROW_COUNT;
      queued := queued + added;
    END IF;
  END LOOP;
  RETURN queued;
END
$$;
REVOKE ALL ON FUNCTION notify.queue_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify.queue_reminders() TO {{WORKER_ROLE}};

-- The API reads the rules (Review queue's "Past reminder") and admins change days and on/off.
GRANT SELECT, UPDATE (days, enabled, updated_at, updated_by, updated_by_name)
  ON notify.reminder_rule TO {{APP_ROLE}};

-- Publishing criteria (R1-05): the previous active version is retired, never changed otherwise.
-- (SELECT, INSERT, UPDATE on criteria_set and criterion were granted in 0001.)
