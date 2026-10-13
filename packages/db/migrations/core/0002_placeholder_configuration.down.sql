-- Rollback of 0002: removes only the placeholder rows it added.
DELETE FROM increments.criterion WHERE criteria_set_id = '00000000-0000-4000-8000-0000000c5e71';
DELETE FROM increments.criteria_set WHERE id = '00000000-0000-4000-8000-0000000c5e71';
DELETE FROM core.increment_cycle WHERE id = '00000000-0000-4000-8000-00000000c026';
