# PeopleForge — Sirius HR Portal

Sirius Group HR Digital Transformation Programme — Phase 1, delivered by Infinia Technologies.

- **R1 — Increment Request Portal:** subsidiary HR submits increment requests evidenced against 5 eligibility criteria; Sirius HR reviews, clarifies and decides, with stage, turnaround and back-and-forth dashboards.
- **R2 — Group-Level Dashboard / Single Source of Truth:** subsidiary employee data, consolidated and versioned per period, with prior-period checks, anomaly flagging and Exec/IHC reports.

Requirements: BRD `SIRIUS-HR-BRD-001` · Scope: SOW `SIRIUS-HR-SOW-P1-001` · Progress: [docs/traceability.md](docs/traceability.md)

> **Current state:** foundation plus sign-in. You sign in with your organisation account (the local Keycloak stands in for Entra ID, pending Sirius IT, A6); the web app shows who you are as confirmed by the API. No business features yet: the data model and module design are awaiting go-ahead.

## Local setup (under 10 minutes)

Prerequisites: Node.js 22 (`nvm use`), Corepack, and `~/sirius/local-infra` running (Keycloak, PostgreSQL, Verdaccio) with the shared `@sirius/*` packages published from `~/sirius/js-platform` (see its README). Log in to the registry once per machine:

```bash
npm adduser --registry http://localhost:4873/    # token is stored in ~/.npmrc, never in this repo
```

```bash
corepack enable
export NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1   # data residency — keep off
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local     # then set AUTH_SECRET: openssl rand -base64 48
pnpm --filter @peopleforge/web db:migrate        # sign-in tables (schema auth)
pnpm build
pnpm dev            # web on http://localhost:3000, api on http://localhost:4000
```

Check it works:

```bash
curl localhost:4000/health/ready     # {"status":"ready","checks":{}}
curl localhost:4000/api/v1/me        # 401 — no token

# With a token from the local Keycloak (needs ~/sirius/local-infra running):
TOKEN=$(~/sirius/local-infra/scripts/token.sh pf.reviewer --raw)
curl -H "Authorization: Bearer $TOKEN" localhost:4000/api/v1/me   # 200, reviewer permissions
```

Open http://localhost:3000: you are sent to the sign-in screen. Sign in as `pf.reviewer` / `LocalDev-2026` at Keycloak; you come back signed in. `pf.norole` shows the "no access" screen. Switch the language to العربية to see the RTL layout.

### End-to-end tests

Playwright runs the production builds against a local test OpenID provider (no Keycloak needed) and a separate test database, `peopleforge_test` (created by local-infra; never the development database):

```bash
pnpm build && pnpm --filter @peopleforge/api build
pnpm --filter @peopleforge/web exec playwright install   # once
pnpm test:e2e
```

Override the database with `E2E_DATABASE_URL` / `E2E_DATABASE_OWNER_URL`.

## Common commands

| Command                        | What it does                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` | Static checks across all workspaces                                                                         |
| `pnpm test`                    | Unit and integration tests                                                                                  |
| `pnpm test:coverage`           | Tests with the 100% coverage gate (same as CI)                                                              |
| `pnpm test:e2e`                | Playwright against the production build (run `pnpm --filter @peopleforge/web exec playwright install` once) |
| `pnpm format`                  | Prettier                                                                                                    |
| `pnpm audit:deps`              | Dependency audit, fails on high/critical                                                                    |

## Repository layout

```
apps/
  api/            NestJS API — bootstrap, auth (policy guard, permissions), http, health, modules/*
  web/            Next.js App Router — i18n (en/ar), proxy (CSP), app/*, components/*, e2e/
infra/docker/     Production Dockerfiles
docs/             ADRs, API (OpenAPI), database conventions, runbooks, traceability
```

Shared code used by every Sirius app comes from the `js-platform` repository as versioned packages ([ADR-0007](docs/adr/0007-shared-platform-packages.md)): `@sirius/config` (TypeScript, ESLint, Vitest with the 100% gate, Prettier), `@sirius/shared-types` (Zod schemas: API error shape, pagination, locale, health) and `@sirius/utils` (redacting logger, spreadsheet safety, text normalisation). Change them there, publish, then bump the version here with `pnpm up -E '@sirius/*@<version>'`.

`apps/worker` and PeopleForge-only packages (`packages/db`, `packages/integrations`) are added with the first feature that needs them, rather than as empty packages.

## Further reading

- [DEPLOYMENT.md](DEPLOYMENT.md) — how to build, configure and run every environment
- [SECURITY.md](SECURITY.md) — controls, reporting, accepted advisories
- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow and Definition of Done
- [docs/adr](docs/adr) — technical decisions
