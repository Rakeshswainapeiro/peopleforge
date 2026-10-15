-- 0002 — Email addresses for the email worker (S4b-2, ADR-012). A user's work email is known
-- from their sign-in (the organisation's directory vouches for it, ADR-003). The worker reads
-- only this view: identity-provider account ID (Entra object ID, the API's user ID) → email.
-- It never sees sessions, tokens or the sign-in tables themselves.
CREATE VIEW auth.recipient_email WITH (security_barrier) AS
  SELECT a."accountId" AS user_id, u.email
  FROM auth.account a
  JOIN auth."user" u ON u.id = a."userId";

GRANT USAGE ON SCHEMA auth TO {{WORKER_ROLE}};
GRANT SELECT ON auth.recipient_email TO {{WORKER_ROLE}};
