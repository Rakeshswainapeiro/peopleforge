# Runbook: email outbox (dead or delayed emails)

Applies to the email worker (`apps/worker`, ADR-012). In-app notifications are not affected by anything here: they are written with the event; only the email copy is delayed or missing.

## Symptoms

- Alert on `email_outbox_alert` in the worker's logs: `dead` > 0, or `oldestDueSeconds` > `OUTBOX_ALERT_AFTER_S` (default 15 minutes).
- Users report a notification in the portal but no email.
- `/health/live` of the worker returns 503 (no batch has succeeded for three lease periods; the orchestrator restarts it).

## Impact

Submitters and Sirius HR reviewers don't get email for new or changed requests (R1-07, R1-13). Nothing is lost: pending emails are sent when the cause is fixed; dead ones can be requeued.

## Diagnose

1. Worker logs, last hour, by event:
   - `email_batch_failed`: the database is unreachable (check `/health/ready` → `database`).
   - `email_retry` with `reason`:
     - `timeout`, `connection`, `circuit_open`: the provider is unreachable from the worker (network, DNS, firewall, provider outage).
     - `smtp_auth`: credentials wrong or expired (`SMTP_USER` / `SMTP_PASSWORD` in the secret store).
     - `smtp_4xx`: the provider is throttling or temporarily refusing.
   - `email_dead` with `smtp_5xx`: the provider refused that address (wrong or deleted mailbox).
   - `email_skipped` with `no_address`: a role has no mailbox configured, or a user never signed in.
2. State of the outbox (as the owner, read-only):

   ```sql
   BEGIN;
   SELECT set_config('app.scope', 'group', true);
   SELECT status, last_error, count(*), min(created_at), max(created_at)
   FROM notify.email_outbox
   WHERE created_at > now() - interval '7 days'
   GROUP BY 1, 2 ORDER BY 1, 2;
   ROLLBACK;
   ```

3. Role mailboxes: `SELECT role, address, updated_at, updated_by FROM notify.role_mailbox;`

## Fix

- **Provider or network:** fix the cause; pending emails go out on their next retry (at most 6 hours later). To send sooner, requeue the pending ones (below, `status = 'pending'`).
- **Credentials:** update the secret, restart the worker.
- **Missing role mailbox** (agreed with Sirius IT):

  ```sql
  INSERT INTO notify.role_mailbox (role, address, updated_by)
  VALUES ('PeopleForge.Reviewer', 'sirius-hr-reviewers@<sirius-domain>', '<your name>')
  ON CONFLICT (role) DO UPDATE SET address = EXCLUDED.address, updated_by = EXCLUDED.updated_by, updated_at = now();
  ```

- **Requeue** dead (or skipped) emails once the cause is fixed. Only recent ones: an email about a request decided days ago does more harm than good. Record the change in the change log.

  ```sql
  BEGIN;
  SELECT set_config('app.scope', 'group', true);
  UPDATE notify.email_outbox
  SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL
  WHERE status = 'dead' AND last_error = 'timeout'          -- the reason you fixed
    AND created_at > now() - interval '2 days';
  COMMIT;
  ```

- **Stuck worker** (liveness 503 repeatedly): check the database first; then restart. Several replicas are safe (rows are claimed with `SKIP LOCKED`).

## Escalate

- Provider outage longer than 2 hours during business hours: Sirius IT (provider contract, A6).
- Many `smtp_5xx` for addresses that should exist: Sirius IT (directory or provider configuration).
- Database unavailable: database on-call (DEPLOYMENT.md §12).
