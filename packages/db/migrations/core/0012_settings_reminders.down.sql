-- Reverts 0012. Reminders stop; criteria versions published since stay (they are data).
DROP FUNCTION notify.queue_reminders();
DROP TABLE notify.reminder_log;
DROP TABLE notify.reminder_rule;
