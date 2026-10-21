# ADR-016: Criteria: adding, removing and thresholds on measured values

- **Status:** Accepted (2026-10-21, slice S11a; R1 gap approved with the R2 design, `docs/design/r2-group-dashboard.md` §6). The threshold units and the five real criteria still need Sirius HR (BRD A1).
- **Requirements:** R1-05 ("admin can add/edit criteria and thresholds"), R1-03, R1-06, NFR-CFG-01, NFR-SEC-01, NFR-PRIV-01, NFR-AUD-01
- **Amends:** ADR-014 §1 (codes and order were fixed; adding or removing was a change request)
- **Related:** migration core `0015_criteria_thresholds`, `packages/contracts/src/thresholds.ts`, `packages/db/src/settings.ts`, `apps/api/src/modules/increment-requests/criteria.ts` (`assessedResult`), web Settings and the request page's criteria cards

## Context

The BRD asks that admins add and edit criteria **and thresholds**. S7 let admins edit the five placeholder criteria but not add, remove or reorder them, and every criterion was Pass or Fail by the preparer's judgement. Sirius HR's real criteria (A1) are likely to include measurable ones (a performance rating, attendance, months in grade). `increments.criterion.pass_rule` was reserved for this in 0001.

## Decision

1. **Add, remove and reorder in a new version.** The admin's list becomes the next version (1–10 criteria, the list's order). A kept criterion keeps its code and accepted file types. A removed one is left out. An added one gets the **next code after any ever used** (C6, C7, …, up to C99), so a code always means the same criterion across versions and in reports. A new criterion accepts the file types the current ones do (a security control, never an admin setting). Requests keep their pinned version, so removing a criterion never changes what an earlier request was assessed against. The audit records the codes added, removed and with a threshold.
2. **A threshold is a pass rule.** `pass_rule` is `{"kind":"manual"}` or `{"kind":"threshold","operator":"gte"|"lte","value":"3.5","unit":"rating"|"score"|"percent"|"months"|"years"|"days"}`. The value is a decimal string (≤ 6 digits, 2 decimals). A CHECK constraint limits `kind`; the API validates the shape.
3. **The measured value decides, on the server.** For a criterion with a threshold, the preparer enters the employee's value; the API derives Pass or Fail with `thresholdResult` (exact decimal comparison in hundredths with `bigint`, inclusive) and ignores any result the client sends. The request page uses the same function, so the card shows the outcome as the value is typed, and the two never disagree. Without a valid value the result is "not set", so the criterion is incomplete. Justification and evidence rules apply as before; Sirius HR still verifies each criterion (R1-07).
4. **Measured values are encrypted** in `criterion_result.measured_value` like justifications (ADR-008): a rating or attendance figure is appraisal data. Lists and dashboards never read them; reviewers see the value against the threshold on the employee page.

## Alternatives considered

- **Thresholds as guidance only (the preparer still chooses Pass/Fail):** simpler, but two people could read the same value differently, and the BRD's "threshold" implies a rule.
- **Reusing removed codes:** "C5" would mean different criteria in different versions; reports and the audit trail would be ambiguous.
- **A separate thresholds table:** one rule per criterion fits the reserved `pass_rule` column; no join, no extra RLS.
- **Plain numeric column:** would allow aggregation, but nothing needs it and it would weaken NFR-PRIV-01.

## Consequences

- Migration `0015` is additive (a nullable column, a CHECK every row meets); rollback drops measured values and turns thresholds back into manual criteria.
- Changing criteria mid-cycle is allowed, as before; requests already created are unaffected.
- When Sirius HR confirms the real criteria (A1), admins configure them in Settings: no code change, unless a new unit or operator is needed (a contract and CHECK change).
