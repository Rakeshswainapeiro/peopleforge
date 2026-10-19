-- Reverts 0014. Flags and their resolutions are lost (back up first in a shared environment).
DROP FUNCTION notify.queue_group_reminders();
DELETE FROM notify.reminder_rule WHERE kind IN ('upload_due', 'flag_open');
ALTER TABLE notify.reminder_rule DROP CONSTRAINT reminder_rule_kind_check;
ALTER TABLE notify.reminder_rule ADD CONSTRAINT reminder_rule_kind_check
  CHECK (kind IN ('review_overdue', 'return_overdue', 'deadline_approaching'));
DROP FUNCTION groupdata.employee_numbers_elsewhere(uuid, date, text[]);
DROP TABLE groupdata.anomaly_flag;
DROP SEQUENCE groupdata.flag_number_seq;
DROP TABLE groupdata.anomaly_rule;
