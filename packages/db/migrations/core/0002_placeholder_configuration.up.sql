-- 0002 — Placeholder configuration so R1 can be built and demonstrated before Sirius HR
-- defines the real criteria (BRD A1) and cycles. Every criterion name is marked [Placeholder].
-- Sirius HR replaces these through criteria settings (R1-05); nothing in code depends on them.

INSERT INTO core.increment_cycle (id, name, starts_on, ends_on, submission_deadline, status, created_by, updated_by)
VALUES ('00000000-0000-4000-8000-00000000c026', '{"en": "Increment cycle 2026"}', '2026-01-01', '2026-12-31',
        '2026-11-30', 'open', 'migration:0002', 'migration:0002');

INSERT INTO increments.criteria_set (id, version, status, activated_at, created_by, updated_by)
VALUES ('00000000-0000-4000-8000-0000000c5e71', 1, 'active', now(), 'migration:0002', 'migration:0002');

INSERT INTO increments.criterion
  (criteria_set_id, position, code, name, description, justification_required, evidence_policy,
   allowed_media_types, max_file_mb, created_by, updated_by)
SELECT '00000000-0000-4000-8000-0000000c5e71', c.position, c.code,
       jsonb_build_object('en', c.name), jsonb_build_object('en', c.description), true, c.evidence,
       ARRAY['application/pdf', 'image/jpeg', 'image/png',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
       10, 'migration:0002', 'migration:0002'
FROM (VALUES
  (1, 'C1', '[Placeholder] Performance rating', 'Latest appraisal meets the minimum rating.', 'required'),
  (2, 'C2', '[Placeholder] Length of service', 'Minimum continuous service in the current role.', 'required'),
  (3, 'C3', '[Placeholder] Disciplinary record', 'No disciplinary action in the last 12 months.', 'required'),
  (4, 'C4', '[Placeholder] Position in grade', 'Current salary is within the grade''s range (e.g. below the midpoint).', 'required'),
  (5, 'C5', '[Placeholder] Mandatory training', 'All mandatory training for the year completed.', 'optional')
) AS c(position, code, name, description, evidence);
