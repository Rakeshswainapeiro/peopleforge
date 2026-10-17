# ADR-013: Sirius HR's review: verification, decisions per employee, returns and resubmission

- **Status:** Accepted (2026-10-17, S5a defaults approved by the product owner); rules marked "to confirm" need Sirius HR's sign-off at the M1 design review
- **Requirements:** R1-07 (route to Sirius HR, queue), R1-08 (return with clarification, subsidiary responds), R1-09 (approve / reject / return per employee), R1-10 (stage per criterion), R1-13 (notifications), R1-15 (audit), NFR-SEC-01, NFR-AUD-01
- **Related:** ADR-002 (RLS), ADR-008 (field encryption), ADR-011 (status history, audit, outbox), migration core `0009_review_decisions`, `packages/db/src/review.ts`, `apps/api/src/modules/increment-requests/review.service.ts`, design `docs/design/r1-increment-portal.md` §8

## Context

The BRD asks Sirius HR to review each employee's five criteria, decide each employee, and return a request with a clarification that the subsidiary answers (R1-07 … R1-09), with a stage per criterion on the dashboards (R1-10). It doesn't say whether criteria must be reviewed in order, whether decisions are per request or per employee, or what a "partly approved" request is. The Figma shows a per-employee review page with "Mark verified" per criterion and Approve / Reject / Return tabs, a Review queue, and a Request Tracker.

## Decision

1. **Verification is per criterion and per employee, in any order.** "Mark verified" stores who and when (`criterion_verification`); "Undo" deletes it. Both are audited. A request's **stage** is the number of criteria verified for every employee still `pending`, plus one: Criterion _n_ of 5, then _Awaiting decision_ when all are verified, then _Decided_. The subsidiary is notified when the stage moves (`stage_changed`). (Strictly in order was rejected: reviewers check evidence as it comes; the stage still reads left to right.)
2. **Decisions are per employee** (`line_decision`, append-only; the latest is current):
   - **Approve** needs every criterion verified (the API refuses otherwise: `not_verified`). As proposed by default; at another percentage (> 0, ≤ 100) only with a **reason** (budget, policy band, internal equity, other) and a **comment**.
   - **Reject** needs a reason (criteria not met, missing evidence, budget, policy, other) and a comment. Final.
   - **Return** needs a reason (missing evidence, unclear justification, proposal needs a change, other) and a comment: the question the subsidiary answers. The subsidiary is notified with _action needed_.
     Reason lists are contract enums, to confirm with Sirius HR (configuration later if they vary).
3. **Request status follows its employees:** `submitted` → `under_review` at the first verification or decision; `returned` while any employee is returned; once all are decided, **final**: `approved`, `rejected`, or `partly_approved` (some of each). `decided_at` marks the end of the request's TAT. Partly approved is final (S5a default): no reopening.
4. **Returns and resubmission (R1-08):** only the returned employees become editable by the subsidiary (proposal, criteria, evidence); other employees stay with Sirius HR, who may keep reviewing them meanwhile. "Resubmit" (idempotent, version-checked, optional note kept on the status event) needs every returned employee complete, sets them back to `pending` and **deletes their verifications**, so Sirius HR checks them again from scratch. Reviewers are notified (`request_resubmitted`, action needed).
5. **Concurrency and integrity:** every action locks the request row; decisions are idempotent per user and `Idempotency-Key`; a decided employee can't be verified or decided again (`line_not_pending`); a final request refuses everything (`not_in_review`).
6. **Confidentiality:** decision comments and approved values are encrypted (ADR-008) because they can discuss appraisals and pay. Lists (queue, tracker) show percentages only; emails carry display values only (reference, employee name, final status), never comments or pay.
7. **Queue and reminders:** the Review queue lists employees oldest-waiting first with chips _To review_, _Returned_, _Past reminder_ (pending for more than `REVIEW_REMINDER_DAYS` = 2 calendar days, S5a default), _All open_, _All_. Reminder emails come with the worker job (S7).
8. **Permissions:** verify needs `increment_request:review`, decide `increment_request:decide` (reviewers), resubmit `increment_request:submit` (subsidiary HR, own subsidiary by RLS). Executives see results only.

## Alternatives considered

- **One decision per request:** simpler, but the BRD and Figma decide employees individually, and a single bad case would block the rest.
- **Keeping verifications on resubmission:** faster for reviewers, but the subsidiary may have changed exactly what was verified. A fresh check is the safe default; Sirius HR can ask for "keep unchanged criteria verified" as a change.
- **Reopening a final request:** not in the BRD; a correction is a new request.

## Consequences

- TAT per criterion (verification time − submission or resubmission) and back-and-forth (decision rows with `returned`, status events) are computable from stored facts (R1-11, R1-12, S7).
- The subsidiary editor has a "fixing" mode for returned requests; the API and repository enforce which employees can change, not just the screen.
- Reason lists and the 2-day reminder are defaults to confirm; changing them is configuration or a small code change, not a redesign.
