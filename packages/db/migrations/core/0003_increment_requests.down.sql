-- Reverts 0003. Destroys every increment request: only for a migration that must be undone.
DROP TABLE increments.idempotency_key;
DROP TABLE increments.request_line;
DROP TABLE increments.increment_request;
DROP TABLE increments.request_sequence;
DROP INDEX core.employee_id_entity_uidx;
