# Requirements traceability

Every Phase 1 requirement maps to its implementation and tests. SOW §10 acceptance requires R1-01…R1-15 and R2-01…R2-14 to be demonstrated. Update this file in the same change that implements or tests a requirement.

Status: `Not started` · `In progress` · `Done` · `Blocked (<input>)`

## Foundation (cross-cutting)

| ID           | Requirement                          | Implementation                                                                                               | Tests                                                            | Status            |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------- |
| NFR-SEC-01   | RBAC, entity segregation             | `apps/api/src/auth/*` (deny-by-default `/api/v1`); RLS pending ADR-002                                       | `apps/api/src/app.test.ts` (401 on all v1 routes)                | In progress       |
| NFR-PRIV-01  | Privacy                              | Log redaction + minimal serializers (`packages/utils/src/logger.ts`, `apps/api/src/http/log-serializers.ts`) | `utils.test.ts`, `log-serializers.test.ts`                       | In progress       |
| NFR-AVAIL-01 | ≥99% business-hours uptime           | Health endpoints, graceful shutdown                                                                          | `app.test.ts`, `shutdown.test.ts`                                | In progress       |
| NFR-BRW-01   | Chrome/Edge/Safari, desktop & tablet | Playwright projects                                                                                          | `apps/web/e2e/*`                                                 | In progress       |
| NFR-INT-01   | Excel/CSV/PDF exports                | CSV/Excel formula-injection guard (`packages/utils/src/spreadsheet-safety.ts`)                               | `utils.test.ts`                                                  | In progress       |
| — (internal) | Arabic/RTL readiness                 | `apps/web/src/i18n/*`, `layout.tsx`, ESLint rules                                                            | `translator.test.ts`, `pages.test.tsx`, `e2e/rtl-switch.spec.ts` | Done (foundation) |

## R1 — Increment Request Portal

| ID    | Requirement                             | Implementation | Tests | Status           |
| ----- | --------------------------------------- | -------------- | ----- | ---------------- |
| R1-01 | Subsidiary HR login & scoping           |                |       | Blocked (A6 IdP) |
| R1-02 | Create increment request batch          |                |       | Blocked (A2)     |
| R1-03 | Capture 5 eligibility criteria          |                |       | Blocked (A1)     |
| R1-04 | Evidence upload per criterion           |                |       | Not started      |
| R1-05 | Configurable criteria definitions       |                |       | Not started      |
| R1-06 | Criteria pass status visualisation      |                |       | Not started      |
| R1-07 | Request routing to Sirius               |                |       | Not started      |
| R1-08 | Back-and-forth / clarification tracking |                |       | Not started      |
| R1-09 | Approve / reject / return decision      |                |       | Not started      |
| R1-10 | Request stage dashboard                 |                |       | Not started      |
| R1-11 | Turnaround time analytics               |                |       | Not started      |
| R1-12 | Back-and-forth time analytics           |                |       | Not started      |
| R1-13 | Automated reminders & alerts            |                |       | Not started      |
| R1-14 | Increment request reports & export      |                |       | Not started      |
| R1-15 | Audit trail                             |                |       | Not started      |

## R2 — Group-Level Dashboard / Single Source of Truth

| ID    | Requirement                          | Implementation | Tests | Status       |
| ----- | ------------------------------------ | -------------- | ----- | ------------ |
| R2-01 | Subsidiary data upload               |                |       | Blocked (A3) |
| R2-02 | Group-level data field standard      |                |       | Blocked (A3) |
| R2-03 | Group employee data consolidation    |                |       | Not started  |
| R2-04 | Single source of truth               |                |       | Not started  |
| R2-05 | Group-level dashboard                |                |       | Blocked (A4) |
| R2-06 | Monthly / quarterly / annual reports |                |       | Not started  |
| R2-07 | Exec & IHC presentation views        |                |       | Blocked (A4) |
| R2-08 | Raw data extraction                  |                |       | Not started  |
| R2-09 | Verification against prior periods   |                |       | Not started  |
| R2-10 | Anomaly & variation flagging         |                |       | Not started  |
| R2-11 | Alert & resolution workflow          |                |       | Not started  |
| R2-12 | Role-based visibility                |                |       | Not started  |
| R2-13 | Data change & upload audit           |                |       | Not started  |
| R2-14 | Palm HR data alignment               |                |       | Blocked (A7) |
