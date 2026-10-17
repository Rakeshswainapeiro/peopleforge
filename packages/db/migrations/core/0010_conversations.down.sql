-- Reverts 0010. Destroys every conversation: only for a migration that must be undone.
DROP TABLE increments.line_message;
