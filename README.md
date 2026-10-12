# Sirius HR Portal

Sirius Group HR Digital Transformation Programme — Phase 1, delivered by Infinia Technologies.

- **R1 — Increment Request Portal:** subsidiary HR submits increment requests evidenced against 5 eligibility criteria; Sirius HR reviews, clarifies and decides, with stage, turnaround and back-and-forth dashboards.
- **R2 — Group-Level Dashboard / Single Source of Truth:** subsidiary employee data, consolidated and versioned per period, with prior-period checks, anomaly flagging and Exec/IHC reports.

Requirements: BRD `SIRIUS-HR-BRD-001` · Scope: SOW `SIRIUS-HR-SOW-P1-001` · Progress: [docs/traceability.md](docs/traceability.md)

> **Current state:** foundation only — tooling, API and web shells, security baseline, i18n/RTL, CI and docs. No business features yet: the data model and module design are awaiting go-ahead, and SSO is blocked on Sirius IT (A6), so every `/api/v1` route returns 401 by design.

## Local setup (under 10 minutes)

Prerequisites: Node.js 22 (`nvm use`), Corepack.

```bash
corepack enable
export NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1   # data residency — keep off
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm build
pnpm dev            # web on http://localhost:3000, api on http://localhost:4000
```

Check it works:

```bash
curl localhost:4000/health/ready     # {"status":"ready","checks":{}}
curl localhost:4000/api/v1/me        # 401 — expected until SSO is configured
```

Open http://localhost:3000 and switch the language to العربية to see the RTL layout.

## Common commands

| Command                        | What it does                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` | Static checks across all workspaces                                                                       |
| `pnpm test`                    | Unit and integration tests                                                                                |
| `pnpm test:coverage`           | Tests with the 100% coverage gate (same as CI)                                                            |
| `pnpm test:e2e`                | Playwright against the production build (run `pnpm --filter @sirius-hr/web exec playwright install` once) |
| `pnpm format`                  | Prettier                                                                                                  |
| `pnpm audit:deps`              | Dependency audit, fails on high/critical                                                                  |

## Repository layout

```
apps/
  api/            NestJS API — bootstrap, auth (policy guard, permissions), http, health, modules/*
  web/            Next.js App Router — i18n (en/ar), proxy (CSP), app/*, components/*, e2e/
packages/
  config/         Shared ESLint and Vitest config (100% thresholds)
  shared-types/   Zod schemas and types shared by web and API
  utils/          Logger with redaction, spreadsheet safety, text normalisation
infra/docker/     Production Dockerfiles
docs/             ADRs, API (OpenAPI), database conventions, runbooks, traceability
```

`apps/worker`, `packages/db`, `packages/ui` and `packages/integrations` are added with the first feature that needs them, rather than as empty packages.

## Further reading

- [DEPLOYMENT.md](DEPLOYMENT.md) — how to build, configure and run every environment
- [SECURITY.md](SECURITY.md) — controls, reporting, accepted advisories
- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow and Definition of Done
- [docs/adr](docs/adr) — technical decisions
