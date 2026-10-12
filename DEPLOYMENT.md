# Deployment Guide — PeopleForge

> **Status (2026-10-06): foundation only.** Hosting, identity provider, email provider and malware scanner are pending Sirius IT (BRD assumption A6). Sections marked **TBC (A6)** are completed when ADR-001 is accepted. Everything else is current and must be kept in sync with the code: any change that adds an env var, service, port, migration or dependency updates this file in the same PR.

## 1. Architecture overview

```
Browser ──HTTPS──▶ Load balancer / WAF ──▶ web (Next.js, :3000)
                                       └─▶ api (NestJS, :4000) ──▶ PostgreSQL, Redis, object storage
                                                 worker (queues, schedules) ──▶ same dependencies
```

| Component        | Image                         | Port              | Depends on         | Status                 |
| ---------------- | ----------------------------- | ----------------- | ------------------ | ---------------------- |
| web              | `infra/docker/web.Dockerfile` | 3000              | api (from ADR-003) | Built                  |
| api              | `infra/docker/api.Dockerfile` | 4000              | none yet           | Built                  |
| worker           | —                             | none (no inbound) | Redis, PostgreSQL  | Planned (R1-13)        |
| PostgreSQL       | managed                       | 5432              | —                  | Planned (ADR-002)      |
| Redis            | managed                       | 6379              | —                  | Planned                |
| Object storage   | S3-compatible                 | 443               | —                  | Planned (R1-04, R2-01) |
| Email (SMTP/API) | provider                      | 587/443           | —                  | TBC (A6)               |
| Malware scanner  | e.g. ClamAV sidecar           | 3310              | —                  | TBC (A6)               |

All components, backups and logs must run in the approved region (assumed UAE).

## 2. Prerequisites

| Item                    | Requirement                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Container runtime       | Docker 24+ / Kubernetes 1.29+ (orchestrator TBC (A6))                                                         |
| Node.js (build/CI only) | 22.x (see `.nvmrc`), pnpm 10.28 via Corepack                                                                  |
| DNS                     | One hostname for web (e.g. `hr.<sirius-domain>`); API hostname depends on ADR-003                             |
| TLS                     | Certificates for every public hostname; TLS 1.2+ only, terminated at the load balancer                        |
| Identity                | OIDC application registration with MFA enforced — TBC (A6)                                                    |
| Secrets                 | A secrets manager in-region (e.g. cloud KMS-backed vault) — TBC (A6)                                          |
| Registry                | Private, in-region container registry with image scanning                                                     |
| Package registry        | Private npm registry for the shared `@sirius/*` packages (js-platform, ADR-0007); local: Verdaccio — TBC (A6) |

## 3. Build

The build installs `@sirius/*` from the private package registry, so it needs the registry URL (build argument) and a read token (BuildKit secret — it never lands in an image layer):

```bash
# A file holding only the read token for the registry host, e.g. for local Verdaccio:
#   //host.docker.internal:4873/:_authToken=<token from ~/.npmrc>
# Keep it outside the repository, chmod 600.
export SIRIUS_REGISTRY=http://host.docker.internal:4873/     # approved registry URL in Test/UAT/Prod

# From the repository root
docker build -f infra/docker/api.Dockerfile \
  --build-arg SIRIUS_REGISTRY="$SIRIUS_REGISTRY" \
  --secret id=npmrc,src="$HOME/.sirius-registry.npmrc" \
  -t <registry>/peopleforge-api:<git-sha> .
docker build -f infra/docker/web.Dockerfile \
  --build-arg SIRIUS_REGISTRY="$SIRIUS_REGISTRY" \
  --secret id=npmrc,src="$HOME/.sirius-registry.npmrc" \
  -t <registry>/peopleforge-web:<git-sha> .
```

CI sets the same values from the repository variables `SIRIUS_REGISTRY`, `SIRIUS_REGISTRY_HOST` and the secret `SIRIUS_REGISTRY_TOKEN` (see `.github/workflows/ci.yml`). Use a read-only token for builds; only release jobs in js-platform hold a publish token.

Image properties (both):

- Multi-stage: `turbo prune` → install from lockfile → build → minimal Alpine runtime.
- Runs as the non-root `node` user; no package manager or build tools in the runtime stage.
- `HEALTHCHECK` on the liveness endpoint (api) / home page (web).
- Telemetry disabled (`NEXT_TELEMETRY_DISABLED=1`, `TURBO_TELEMETRY_DISABLED=1`) — required for data residency.
- Tag with the git SHA; never deploy `latest`. Pin the base image by digest in the registry mirror.

## 4. Environment variables

Validated at startup; the API exits with code 1 and lists the offending **key names** (never values) if any are invalid.

### api

| Name                         | Purpose                                                                                                | Required | Default | Example                | Store             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | -------- | ------- | ---------------------- | ----------------- |
| `APP_ENV`                    | Environment name; tightens rules in `uat`/`prod`                                                       | Yes      | —       | `prod`                 | Deployment config |
| `PORT`                       | HTTP listen port                                                                                       | No       | `4000`  | `4000`                 | Deployment config |
| `LOG_LEVEL`                  | `fatal`…`trace`, `silent`                                                                              | No       | `info`  | `info`                 | Deployment config |
| `CORS_ALLOWED_ORIGINS`       | Comma-separated browser origins allowed to call the API. **Required and HTTPS-only in `uat`/`prod`**   | uat/prod | empty   | `https://hr.sirius.ae` | Deployment config |
| `TRUST_PROXY_HOPS`           | Number of proxies in front of the API (for client IP / rate limiting)                                  | No       | `1`     | `1`                    | Deployment config |
| `REQUEST_BODY_LIMIT_KB`      | Max JSON body size                                                                                     | No       | `100`   | `100`                  | Deployment config |
| `RATE_LIMIT_WINDOW_MS`       | Rate-limit window                                                                                      | No       | `60000` | `60000`                | Deployment config |
| `RATE_LIMIT_MAX`             | Requests per IP per window on `/api/v1`                                                                | No       | `300`   | `300`                  | Deployment config |
| `READINESS_CHECK_TIMEOUT_MS` | Per-dependency readiness timeout                                                                       | No       | `2000`  | `2000`                 | Deployment config |
| `SHUTDOWN_TIMEOUT_MS`        | Hard deadline for graceful shutdown; must be **less** than the orchestrator's termination grace period | No       | `25000` | `25000`                | Deployment config |

No secrets yet. Database, Redis, storage and OIDC credentials will be added here, each sourced from the secrets manager.

### web

| Name                      | Purpose                                         | Required | Default     | Example   | Store |
| ------------------------- | ----------------------------------------------- | -------- | ----------- | --------- | ----- |
| `NEXT_TELEMETRY_DISABLED` | Must be `1` (data residency) — set in the image | Yes      | `1` (image) | `1`       | Image |
| `PORT`                    | Listen port                                     | No       | `3000`      | `3000`    | Image |
| `HOSTNAME`                | Bind address                                    | No       | `0.0.0.0`   | `0.0.0.0` | Image |

## 5. Environments and pipeline

| Environment | Purpose                             | Data                                       | Deploys from                 |
| ----------- | ----------------------------------- | ------------------------------------------ | ---------------------------- |
| Dev         | Integration of merged work          | Synthetic only                             | `main`, automatically        |
| Test        | SIT (SOW weeks 6–7)                 | Synthetic only                             | Tagged release candidate     |
| UAT         | User acceptance with Sirius HR (M4) | Synthetic or masked, as agreed with Sirius | Same tag as Test             |
| Prod        | Live                                | Real employee data                         | Same tag, after UAT sign-off |

**CI (`.github/workflows/ci.yml`)**, on every PR and push to `main`:

1. `verify` — format check, lint, typecheck, unit/integration tests with the 100% coverage gate, build.
2. `dependencies` — `pnpm audit --audit-level high` and OSV-Scanner; fails on high/critical.
3. `sast` — Semgrep with local rulesets (no code uploaded).
4. `e2e` — Playwright on Chromium, Edge, WebKit and tablet against the production build.
5. `images` — builds both images and scans them with Trivy; fails on high/critical.

**CD — TBC (A6).** Deployment jobs must run on self-hosted runners in the approved region and pull secrets from the in-region secrets manager. The same image digest is promoted Dev → Test → UAT → Prod; images are never rebuilt per environment.

### Deploying a release (per environment)

1. Confirm CI is green for the commit and both image scans passed.
2. Run database migrations (§6) — not applicable until ADR-002.
3. Roll out `api`, wait for `/health/ready` = 200 on all replicas.
4. Roll out `web`.
5. Run the smoke tests (§10).
6. Record the deployed SHA and time in the release log.

## 6. Database migrations and rollback

Not applicable until the first migration (ADR-002). The procedure will be:

1. Take an on-demand backup / snapshot.
2. Run migrations as the schema-owner role (never the application role) as a one-off job before rolling out the new API.
3. Migrations are expand/contract, so the previous API version keeps working against the new schema.
4. Rollback: redeploy the previous image first; run the paired rollback script only if the migration itself must be reverted.

## 7. Health endpoints

| Endpoint                  | Use                                                    | Healthy                                                                |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET /health/live` (api)  | Liveness probe                                         | `200 {"status":"alive"}`                                               |
| `GET /health/ready` (api) | Readiness probe; checks each dependency with a timeout | `200`; `503` if any dependency is down **or the instance is draining** |
| `GET /` (web)             | Liveness/readiness                                     | `200`                                                                  |

Recommended probes: liveness every 15 s, failure threshold 3; readiness every 5 s, failure threshold 2. Health endpoints are unauthenticated and not rate limited; they expose dependency names and up/down only. Block `/health/*` at the public load balancer if it is internet-facing.

**Graceful shutdown:** on `SIGTERM` the API makes readiness return 503, stops accepting connections, finishes in-flight requests, closes dependencies, then exits. If draining exceeds `SHUTDOWN_TIMEOUT_MS` it exits with code 1. Set the orchestrator's termination grace period above this value (e.g. 30 s for the 25 s default).

## 8. Monitoring, logging and alerting

- **Logs:** JSON lines on stdout, one per request plus application events. Every line carries `service` and request ID (`X-Request-Id` is accepted from upstream if safe, otherwise generated, and returned on every response). Request logs contain method, path (no query string), status and duration — no headers, bodies, tokens, PII or salary values. Ship to the in-region log store; retention TBC with Sirius (NFR-PRIV-01).
- **Metrics/tracing:** OpenTelemetry instrumentation is added with the first database-backed feature; exporter endpoint must be in-region.
- **Alerts (initial):** readiness failing > 2 min; 5xx rate > 1% over 5 min; p95 latency > 3 s on dashboard endpoints (NFR-PERF-01); container restarts > 3 in 15 min; certificate expiry < 21 days.
- **Availability target:** ≥ 99% during business hours (NFR-AVAIL-01). Business hours and maintenance windows: TBC with Sirius HR.

## 9. Backup and disaster recovery

TBC (A6), proposed targets for agreement:

- PostgreSQL: continuous WAL archiving + daily snapshots, 35-day retention, in-region; quarterly restore test.
- Object storage: versioning enabled; cross-zone replication within the region.
- RPO ≤ 15 min, RTO ≤ 4 business hours.
- DR runbook: `docs/runbooks/` (added with the database).

## 10. Post-deployment smoke test

- [ ] `GET /health/live` and `/health/ready` return 200 on every API replica.
- [ ] `GET /api/v1/me` without a session returns 401 in the standard error shape with `X-Request-Id`.
- [ ] Home page loads over HTTPS; response has `Content-Security-Policy` with a `nonce-` and `Strict-Transport-Security`.
- [ ] Language switch to العربية sets `<html dir="rtl">`, and back.
- [ ] No errors in logs for the deployed version during the first 10 minutes.

## 11. Scaling

- `web` and `api` are stateless; scale horizontally behind the load balancer.
- **Before running more than one API replica**, move the rate limiter to a shared Redis store — the current in-memory store limits per replica only.
- Start with 2 replicas each in UAT/Prod for availability; size from the load test (ADR-004) before UAT.

## 12. Troubleshooting

| Symptom                                                                  | Likely cause                                                                   | Action                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| API exits immediately with `Invalid or missing environment variables: …` | Config validation failed                                                       | Fix the listed keys (§4)                                                            |
| Browser shows CORS errors                                                | Web origin not in `CORS_ALLOWED_ORIGINS`                                       | Add the exact origin (scheme + host + port)                                         |
| All clients rate-limited at once                                         | `TRUST_PROXY_HOPS` wrong, so every request appears to come from the proxy IP   | Set it to the number of proxies in front of the API                                 |
| Readiness flaps during deploys                                           | Grace period shorter than `SHUTDOWN_TIMEOUT_MS`                                | Increase the grace period                                                           |
| Outbound connections to `telemetry.vercel.com`                           | Telemetry not disabled in a custom image                                       | Set `NEXT_TELEMETRY_DISABLED=1`                                                     |
| Build fails with `ERR_PNPM_FETCH_401` / `404` on `@sirius/…`             | Registry token missing, wrong host in the token line, or package not published | Check the `npmrc` build secret and `SIRIUS_REGISTRY` (§3); publish from js-platform |
| `/api/v1/*` always returns 401                                           | Expected until OIDC is configured (A6)                                         | —                                                                                   |
