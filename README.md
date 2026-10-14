# PeopleForge — Sirius HR Portal

Sirius Group HR Digital Transformation Programme — Phase 1, delivered by Infinia Technologies.

- **R1 — Increment Request Portal:** subsidiary HR submits increment requests evidenced against 5 eligibility criteria; Sirius HR reviews, clarifies and decides, with stage, turnaround and back-and-forth dashboards.
- **R2 — Group-Level Dashboard / Single Source of Truth:** subsidiary employee data, consolidated and versioned per period, with prior-period checks, anomaly flagging and Exec/IHC reports.

Requirements: BRD `SIRIUS-HR-BRD-001` · Scope: SOW `SIRIUS-HR-SOW-P1-001` · Progress: [docs/traceability.md](docs/traceability.md)

> **Current state:** sign-in, and the first R1 slices: subsidiary HR raises a draft increment request, adds employees with a % or amount proposal (S2), and assesses each employee against the eligibility criteria with a justification and evidence files that are type-checked and malware-scanned (S3). Submitting to Sirius HR comes next (S4). The 5 criteria are placeholders until Sirius HR defines them (A1).

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
cp packages/db/.env.example packages/db/.env     # then set DATA_ENCRYPTION_KEYS (command in the file)
                                                 # and copy both DATA_ENCRYPTION_* lines into apps/api/.env
pnpm build
pnpm db:migrate     # core schema + placeholder criteria (packages/db), then sign-in tables (web)
pnpm db:seed        # synthetic subsidiaries A/B/C, pf.alpha.hr → A, pf.beta.hr → B, employees
pnpm dev            # web on http://localhost:3000, api on http://localhost:4000
```

Check it works:

```bash
curl localhost:4000/health/ready     # {"status":"ready","checks":{"database":"up","object_store":"up","malware_scanner":"up"}}
curl localhost:4000/api/v1/me        # 401 — no token

# With a token from the local Keycloak (needs ~/sirius/local-infra running):
TOKEN=$(~/sirius/local-infra/scripts/token.sh pf.reviewer --raw)
curl -H "Authorization: Bearer $TOKEN" localhost:4000/api/v1/me   # 200, reviewer permissions, all entities
```

Open http://localhost:3000: you are sent to the sign-in screen. Sign in as `pf.reviewer` / `LocalDev-2026` at Keycloak; you come back signed in. `pf.alpha.hr` sees only Subsidiary A and the New Request item; `pf.norole` shows the "no access" screen. Switch the language to العربية to see the RTL layout.

### Evidence files locally

The copied `apps/api/.env` stores evidence under `/tmp/peopleforge-evidence` and skips the malware scan (`MALWARE_SCANNER=none`; refused in UAT and production). To run the real path — an S3-compatible store and ClamAV — start both in Docker, then switch to the commented `s3`/`clamav` values in `apps/api/.env` and restart the API:

```bash
docker run -d --name peopleforge-s3 -p 9090:9090 \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=peopleforge-evidence adobe/s3mock:5.1.0
docker run -d --name peopleforge-clamav -p 3310:3310 clamav/clamav-debian:1.4
docker logs -f peopleforge-clamav    # first start downloads signatures: wait for "socket found, clamd started"
```

MinIO isn't used: the project is archived and no longer publishes images (ADR-010). Uploading a PDF that contains the EICAR test string shows the malware refusal.

### Database integration tests

`packages/db` tests run against the real `peopleforge_test` database (Row-Level Security can't be mocked): they drop and recreate the core schema each run. Override with `TEST_DATABASE_URL` / `TEST_DATABASE_OWNER_URL`. Don't run them at the same time as the E2E tests, which use the same database.

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
  api/            NestJS API — bootstrap, auth (policy guard, principal), http, health, modules/*
  web/            Next.js App Router — i18n (en/ar), proxy (CSP), app/(portal)/*, components/*, e2e/
packages/
  contracts/      API contract shared by api and web: roles, permissions, request/response schemas
  ui/             Design system: Figma tokens + components (ADR-009, docs/design/design-system.md)
  db/             SQL migrations, migration runner, RLS scope (withScope), field encryption, dev seed
infra/docker/     Production Dockerfiles
docs/             ADRs, API (OpenAPI), database conventions, runbooks, traceability
```

Shared code used by every Sirius app comes from the `js-platform` repository as versioned packages ([ADR-0007](docs/adr/0007-shared-platform-packages.md)): `@sirius/config` (TypeScript, ESLint, Vitest with the 100% gate, Prettier), `@sirius/shared-types` (Zod schemas: API error shape, pagination, locale, health) and `@sirius/utils` (redacting logger, spreadsheet safety, text normalisation). Change them there, publish, then bump the version here with `pnpm up -E '@sirius/*@<version>'`.

`apps/worker` and `packages/integrations` are added with the first feature that needs them, rather than as empty packages.

## Further reading

- [DEPLOYMENT.md](DEPLOYMENT.md) — how to build, configure and run every environment
- [SECURITY.md](SECURITY.md) — controls, reporting, accepted advisories
- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow and Definition of Done
- [docs/adr](docs/adr) — technical decisions
