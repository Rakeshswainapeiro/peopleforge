-- Rollback of 0001. Signs everyone out and forgets all sign-in accounts; nothing else in
-- PeopleForge references these tables yet.
DROP SCHEMA IF EXISTS auth CASCADE;
