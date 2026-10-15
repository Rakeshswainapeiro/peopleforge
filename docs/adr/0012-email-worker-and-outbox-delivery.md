# ADR-012: Email worker: outbox delivery without a queue server

- **Status:** Accepted (2026-10-15); email provider and sender address TBC with Sirius IT (A6)
- **Requirements:** R1-07 (submit to Sirius HR, notify by email), R1-13 (notifications), NFR-SEC-01, NFR-PRIV-01, NFR-AVAIL-01
- **Related:** ADR-011 (outbox in the same transaction as the event), ADR-002 (roles, RLS), migrations core `0008_email_worker` and web `0002_recipient_email`, `apps/worker`, `packages/db/src/email-outbox.ts`, `packages/integrations/src/email-sender.ts`, runbook `docs/runbooks/email-outbox.md`

## Context

Since S4a every notification has queued a row in `notify.email_outbox` in the same transaction as the event (ADR-011); nothing sent them. The project's proposed stack lists Redis for queues, the email provider is unknown (A6), and Sirius users aren't stored in our database: their roles come from Entra ID on each request. Two questions had to be settled: how emails get from the outbox to the provider, and where the addresses come from.

## Decision

1. **A separate worker app (`apps/worker`)** polls the outbox, renders each email, sends it and records the outcome. It takes no traffic: one port answers `/health/live` and `/health/ready`.
2. **No queue server for now.** The worker claims due rows straight from PostgreSQL with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, setting `next_attempt_at` to now + a lease. Several workers can run at once and never take the same row. A worker that dies mid-batch leaves its rows to be claimed again when the lease ends, so delivery is **at least once**: a crash between "sent" and "recorded" can send an email twice; it never loses one.
3. **Delivery state on the outbox row:** `status` (`pending`, `sent`, `dead`, `skipped`), `attempts`, `next_attempt_at`, `last_error` (a short reason code such as `smtp_550`, never the server's text, which can echo addresses) and the provider's `message_id`.
4. **Retries with backoff:** 1 min, 5 min, 30 min, 2 h, 6 h; after `OUTBOX_MAX_ATTEMPTS` (default 6, about 8½ hours) the row is `dead`. An SMTP 5xx (address refused) is dead at once; 4xx, timeouts and connection failures retry; a refused login retries (it is our configuration). A circuit breaker stops a provider outage from holding every email for the full timeout; a refused address doesn't trip it.
5. **Addresses:**
   - **A user** (the submitter): their work email from sign-in. The web app stores it from the ID token (the organisation's directory vouches for it, ADR-003). The worker reads a single view, `auth.recipient_email` (Entra object ID → email), not the sign-in tables.
   - **A role** (all Sirius HR reviewers): a shared mailbox or distribution list per role in `notify.role_mailbox`, configuration agreed with Sirius IT (NFR-CFG-01). Looking up the members of an Entra group through Microsoft Graph was rejected for Phase 1: a new outside connection and Graph permissions, so a change request.
   - **No address** (a user who never signed in, a role without a mailbox): the email is `skipped` with `no_address` and logged; the in-app notification is unaffected.
6. **Least privilege:** the worker connects as its own role, `peopleforge_worker`. It may read notifications, role mailboxes and the address view, and update only the delivery columns of the outbox. It can't read requests, employees, salaries, justifications, the audit trail or the sign-in tables; tests prove each refusal. The app role still only inserts into the outbox.
7. **Content:** subject, plain text and a simple HTML part in the recipient's language (English until Arabic content exists: change request), from message files like the web app's (shared code in `@peopleforge/i18n`). Display values only (reference, counts, subsidiary code, actor name), re-validated by the worker; every value HTML-escaped; one link, built from `PORTAL_URL` and the request's UUID. Never salaries, percentages or justifications, and no attachments. The recipient is one validated address and the subject one line (header injection).
8. **Transports:** `smtp` (the provider; STARTTLS required or implicit TLS outside dev/test, TLS 1.2+, credentials from the secret store) and `file` (each email as an `.eml` file, dev/test only, refused in UAT and production). Locally, Mailpit catches SMTP (`infra/local/compose.yaml`).
9. **Monitoring:** every `OUTBOX_STATS_INTERVAL_MS` the worker logs `email_outbox_stats` (pending, due, dead, oldest due age) and, when emails are dead or the oldest due one has waited longer than `OUTBOX_ALERT_AFTER_S`, `email_outbox_alert`, which the alert rules match. Liveness fails when no batch has succeeded for three leases, so a stuck worker is restarted.

## Alternatives

- **Redis + BullMQ.** A second store that can drift from the database (an email queued for a transaction that rolled back, or lost when Redis restarts without persistence), more infrastructure for A6 to approve, and nothing gained at Phase 1 volumes (a few hundred emails a day). Revisit with S7 (scheduled reports, reminders on triggers) or if load testing (ADR-004) shows polling costs too much.
- **PostgreSQL `LISTEN/NOTIFY` instead of polling.** Lower latency, but notifications are lost while no worker listens, so polling is needed anyway. A 5-second poll is fast enough for email.
- **Entra group lookup via Microsoft Graph** for reviewers (see 5). Change request.
- **Storing the recipient's address on the outbox row when the event happens.** The API sees only the access token, whose `preferred_username` is not always an address (it isn't in the local Keycloak realm). Rejected in favour of the sign-in record.
- **Sending from the API's request (no worker).** Rejected in ADR-011.

## Consequences

- One more deployable (`infra/docker/worker.Dockerfile`) and one more database role, created by the DBA once per environment (DEPLOYMENT.md §6). Migrations fail with a clear message if it doesn't exist.
- Duplicates are possible after a crash (at least once). Subjects and bodies are written so a duplicate is harmless.
- Reviewers get one email at the shared mailbox per new request, not one each; per-person delivery needs the Graph lookup (change request).
- Dead emails stay in the table for the runbook (requeue or ignore); they are not retried automatically.
- Phase 1 emails are English only, like the UI at go-live.
