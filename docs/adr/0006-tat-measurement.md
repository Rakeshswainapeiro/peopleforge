# ADR-006: Measuring turnaround time and back-and-forth

- **Status:** Accepted for Phase 1 (2026-10-18, S7 defaults approved by the product owner); calendar vs business hours to confirm with Sirius HR (design Q6). Changing it is a change to one module, not to stored data.
- **Requirements:** R1-10 (age), R1-11 (TAT per criterion and per request, by entity and period), R1-12 (back-and-forth time per request and entity), R1-14 / RP-02, DASH-D3, DASH-D4
- **Related:** ADR-013 (review, returns, resubmission), ADR-014 (reminders), `packages/db/src/analytics.ts`, `apps/api/src/modules/analytics/measures.ts`, web `/analytics`

## Context

The BRD asks for TAT per criterion and per request and for back-and-forth time, but not whether time is counted in calendar or working hours, nor where a criterion's clock starts when an employee is returned and resubmitted. Every fact needed is already stored with a timestamp (UTC): submission and decision on the request, each verification, each decision (including returns), each status change (including resubmissions) and each message.

## Decision

1. **Elapsed time, 24-hour days, shown with one decimal** (1.5 days). No working-day calendar until Sirius HR confirms one (Asia/Dubai week, public holidays): such a calendar would replace `elapsedDays` in one module and recompute everything, since only raw timestamps are stored. Lists and the RP-01 TAT column keep whole days (ADR-013).
2. **Request TAT:** submission → final decision (`decided_at`); open requests are measured to now and shown as open.
3. **Criterion TAT:** from when the criterion started waiting for Sirius HR → its verification. It starts at submission, or — for an employee who was returned — at the resubmission that followed the return (the subsidiary's time isn't counted against Sirius HR). Only current verifications count (an undone check isn't a TAT).
4. **Back-and-forth:** each return → the next time the request left _Returned_ (the resubmission), or now while still returned: **time with the subsidiary**. Questions: from a Sirius HR question to the subsidiary's next message about that employee; several questions in a row are answered together, measured from the first.
5. **Who sees it:** Sirius HR in group scope (`report:read_operational`); a subsidiary is refused (403) because the measures compare subsidiaries. No pay or employee names: references, subsidiary codes, counts and durations only.
6. **Computed in the API from facts** (one query per kind of fact, Row-Level Security applied), in one pure module shared by the page and RP-02, tested with worked examples. At Phase 1 volumes (hundreds of requests per cycle) this answers in well under NFR-PERF-01's 3 s; pre-aggregated tables refreshed by the worker are the next step if a cycle grows past that (load test before UAT).

## Alternatives considered

- **Business hours now:** needs Sirius HR's working week and holidays (Q6); guessing would mislead.
- **Criterion TAT from the original submission:** penalises Sirius HR for time the subsidiary held a returned employee.
- **Materialised views from day one:** more moving parts (refresh jobs, staleness) before volumes need them.

## Consequences

- RP-02 and the page always agree (one calculation).
- When Sirius HR confirms a working calendar, `elapsedDays` changes and every figure follows; nothing stored changes.
