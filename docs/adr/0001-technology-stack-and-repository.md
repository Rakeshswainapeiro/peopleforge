# ADR-001: Technology stack and repository structure

- **Status:** Proposed — pending Sirius IT confirmation of hosting, identity provider and infrastructure (BRD assumption A6, SOW §9.1)
- **Date:** 2026-10-06
- **Deciders:** Infinia delivery team (Lead Full Stack Developer); Sirius IT for hosting and IdP
- **Requirements:** NFR-SEC-01, NFR-PRIV-01, NFR-PERF-01, NFR-SCALE-01, NFR-AVAIL-01, NFR-BRW-01, NFR-INT-01

## Context

The BRD (SIRIUS-HR-BRD-001) and SOW (SIRIUS-HR-SOW-P1-001) define _what_ Phase 1 delivers — the Increment Request Portal (R1) and the Group-Level Dashboard / Single Source of Truth (R2) — but not the technology. We have 8 weeks and 159 person-days, a team strongest in TypeScript, React/Next.js and Node.js, and three later phases (ATS, pre-onboarding, policy chat agent) that should reuse identity, notifications, file storage and audit.

The portal holds employee personal data and compensation, so security, data residency and auditability dominate the choice. Hosting is assumed to be a UAE-region private or sovereign cloud until Sirius IT confirms.

## Decision

| Concern        | Choice                                                                                | Notes                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository     | pnpm workspaces + Turborepo monorepo                                                  | One lockfile, shared Zod schemas between web and API, cached CI tasks                                                                        |
| Language       | TypeScript 6.0 (strict) everywhere                                                    | TS 7 not yet supported by typescript-eslint                                                                                                  |
| Runtime        | Node.js 22 LTS                                                                        |                                                                                                                                              |
| Web            | Next.js 16 (App Router), React 19, Tailwind CSS 4                                     | Server components by default; `output: 'standalone'` for small images                                                                        |
| API            | Express 5, layered (route → service → repository)                                     | Chosen over NestJS: less framework surface, team familiarity, explicit composition root. Revisit if module count makes manual wiring painful |
| Validation     | Zod 4, shared via `@sirius-hr/shared-types`                                           |                                                                                                                                              |
| Logging        | pino (JSON), redaction + minimal serializers                                          | No headers or query strings in request logs                                                                                                  |
| Database       | PostgreSQL (version per hosting), Row-Level Security for entity isolation             | ORM (Prisma vs Drizzle) decided in ADR-002 with the data model                                                                               |
| Cache / queues | Redis + BullMQ (worker app)                                                           | Introduced with notifications (R1-13)                                                                                                        |
| Object storage | S3-compatible, in-region                                                              | Evidence files (R1-04) and uploads (R2-01)                                                                                                   |
| Testing        | Vitest, React Testing Library, Supertest, Playwright, Testcontainers, k6              | 100% coverage gate                                                                                                                           |
| i18n / RTL     | Own small translator over JSON catalogues; `lang`/`dir` on `<html>`; logical CSS only | See below                                                                                                                                    |
| Containers     | Multi-stage Docker, non-root, Alpine runtime                                          |                                                                                                                                              |

### Internationalisation and RTL (internal standard)

Not a BRD requirement. English is the only language at go-live, but the code is Arabic/RTL-ready so Arabic becomes a translation exercise rather than a rewrite:

- All UI text in `apps/web/messages/{en,ar}.json`; typed keys; missing Arabic keys fall back to English.
- An ESLint rule rejects hardcoded JSX text and physical `left/right` Tailwind utilities.
- API errors carry `code` + `messageKey`; the client localises.
- An `en ↔ ar` switch is demonstrated on the home screen with a Playwright test.
- The Arabic strings in `ar.json` are developer placeholders for the demo and must be reviewed by a qualified translator before any Arabic go-live. Arabic content and translated UI at go-live would be a change request (SOW §11).

We chose a ~60-line translator over next-intl: no extra dependency, full control of fallback behaviour, and nothing in Phase 1 needs ICU plural rules. Revisit if pluralisation or date-heavy messages appear.

### Telemetry

Next.js and Turborepo send anonymous telemetry to third-party endpoints outside the approved region. Both are disabled (`NEXT_TELEMETRY_DISABLED=1`, `TURBO_TELEMETRY_DISABLED=1`) in Docker images, CI and documented local setup.

## Alternatives considered

- **NestJS** — strong module/DI conventions suit 13 modules, but adds decorators, reflection and a larger dependency tree. Express with explicit factories keeps every dependency visible and easy to test at 100% coverage.
- **Separate repos for web and API** — rejected: duplicated schemas, two pipelines, harder atomic changes.
- **next-intl** — capable, but more than Phase 1 needs (see above).

## Consequences

- Positive: one language and toolchain; shared types remove a whole class of client/server drift; small, auditable runtime images.
- Negative: we own the API's structural conventions (no framework enforcing them) — CONTRIBUTING.md and code review carry that load.
- Open: hosting, IdP, email provider, malware scanner and PostgreSQL version all depend on Sirius IT. The API currently rejects every `/api/v1` request (deny-by-default stand-in) until OIDC is wired.
- Open: whether the browser calls the API directly (needs cookie + CSRF design) or via the Next.js server as a backend-for-frontend. To be decided with the IdP in ADR-003.
