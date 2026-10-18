-- Reverts 0011. Actor names recorded since are lost.
DROP INDEX audit.audit_log_request_idx;
DROP POLICY audit_read_entity ON audit.audit_log;
ALTER TABLE audit.audit_log DROP COLUMN actor_name;
