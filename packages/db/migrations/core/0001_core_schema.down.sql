-- Rollback of 0001: removes the core and increments schemas and everything in them.
DROP SCHEMA IF EXISTS increments CASCADE;
DROP SCHEMA IF EXISTS core CASCADE;
