# ADR-014: Settings: versioned criteria and reminders on configured triggers

- **Status:** Accepted (2026-10-18, S7 defaults approved by the product owner); the default days need Sirius HR's sign-off (design Q9)
- **Requirements:** R1-05 (criteria are configuration), R1-13 (reminders and alerts on configured triggers, email and in-app), NFR-CFG-01, NFR-AUD-01, NFR-SEC-01
- **Related:** ADR-011 (notifications and outbox), ADR-012 (email worker and its role), ADR-013 §7 (Review queue "Past reminder"), migration core `0012_settings_reminders`, `packages/db/src/settings.ts`, `apps/api/src/modules/settings/*`, `apps/worker/src/reminders/scheduler.ts`, web `/settings`

## Context

The five eligibility criteria are pending from Sirius HR (BRD A1) and must be configuration, not code (R1-05, NFR-CFG-01). Requests pin the criteria version active when they were created (0001), so a change must never rewrite what a request was assessed against. R1-13 asks for reminders "on configured triggers" for pending actions and deadlines, by email and in the portal. The worker that sends email (ADR-012) has a database role that can't read requests, employees or pay, and that boundary should hold.

## Decision

1. **Criteria are edited as a new version.** An admin (`criteria:configure`) edits each criterion's English and Arabic name and description, whether a justification is required, the evidence policy and the largest file (≤ the portal's 10 MB). Saving **publishes version n+1** and retires version n in one transaction, locked against a concurrent publish, refused if version n is no longer the active one (409) or if the codes or their order differ (400: C1…C5 stay; adding or removing criteria is a change request). _Amended by ADR-016 (S11a): admins may now add, remove and reorder criteria, and give one a threshold._ Accepted file types are carried over: they are a security control, not an admin setting. Existing requests keep their pinned version; new requests use the new one. Audited as `criteria_set.published`.
2. **Reminder triggers are rows in `notify.reminder_rule`**, changed by admins (days 1–30, on/off), audited as `reminder_rule.updated` with the admin's name:
   - `review_overdue` (default **2** days): employees waiting for Sirius HR longer than that → the reviewers' role, action needed. The Review queue's _Past reminder_ chip reads the same row, so the screen and the email never disagree.
   - `return_overdue` (default **2** days): a request returned and not resubmitted for that long → the subsidiary user who submitted it.
   - `deadline_approaching` (default **3** days): a draft whose cycle's submission deadline is that many Dubai calendar days away or less → whoever created the draft.
     Ages are elapsed time (days × 24 h) like the queue; the deadline compares dates in Asia/Dubai (ADR-006 decides business hours later).
3. **Each reminder is sent once per episode.** `notify.reminder_log` keys each by trigger, request and episode (the time waiting started, the time it was returned, or the deadline date). A new episode (resubmitted and waiting again, a new deadline) reminds again; nothing repeats daily. Overlapping workers and restarts can't double-send (primary key + `ON CONFLICT DO NOTHING`).
4. **The worker queues reminders through one function.** `notify.queue_reminders()` is `SECURITY DEFINER` (owner, `search_path` pinned), takes **no arguments** (time is `now()`, recipients come from the requests and rules), and is executable by the worker role only. It writes notifications and outbox rows like any event; the worker then emails them (ADR-012). The worker role still has no `SELECT` on requests, rules or the log (tests prove it). The worker checks every `REMINDER_INTERVAL_MS` (default 15 min) and at start.
5. **Wording stays in the message files.** Notifications carry kind and display params (reference, subsidiary code, counts, days, deadline date), never pay or text; the web app and the worker word them per locale.

## Alternatives considered

- **Reminder logic in the worker (TypeScript):** would need the worker role to read requests and lines, widening ADR-012's least-privilege boundary. The function keeps it to `EXECUTE` on one routine.
- **Editing criteria in place:** simpler, but it would change what past requests were assessed against (R1-05 audit trail of the rules). Versions are cheap.
- **Daily repeat reminders:** noisier; can be added as a `repeat_days` column if Sirius HR wants it.
- **A new `notification:configure` permission:** not needed yet; the admin role holds `criteria:configure` for the portal's settings. Splitting it is a small change when Sirius HR asks.

## Consequences

- The default days (2, 2, 3) are visible and changeable by admins without a release; the Review queue follows them.
- Generating reminders duplicates the notification insert in SQL (one place, the function); the notification shape is shared with `insertNotifications` by table constraints and tests.
- Adding a trigger is a migration (CHECK list, function branch) plus message keys; that's deliberate, so a trigger can't be configured that nobody wrote wording for.
