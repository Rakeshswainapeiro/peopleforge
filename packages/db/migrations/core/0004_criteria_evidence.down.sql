-- Reverts 0004. Destroys every criterion result and evidence record (the stored objects stay in
-- the bucket and must be removed separately): only for a migration that must be undone.
DROP TABLE increments.evidence_file;
DROP TABLE increments.criterion_result;
ALTER TABLE increments.request_line DROP CONSTRAINT request_line_id_entity_key;
