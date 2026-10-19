# Deployment Guide — PeopleForge

> **Status (2026-10-18): slices S1–S7 (foundation, increment request drafts, criteria and evidence, submission with audit trail and notifications, the dashboards and request detail, the email worker, Sirius HR's review with decisions, returns and resubmission, questions and answers, reports with the audit trail, settings with reminders, and TAT and back-and-forth analytics: R1 complete for UAT).** Hosting, identity provider, email provider, object store and malware scanner products are pending Sirius IT (BRD assumption A6). Sections marked **TBC (A6)** are completed when ADR-001 is accepted. Everything else is current and must be kept in sync with the code: any change that adds an env var, service, port, migration or dependency updates this file in the same PR.

## 1. Architecture overview

```
Browser ──HTTPS──▶ Load balancer / WAF ──▶ web (Next.js, :3000)
                                       └─▶ api (NestJS, :4000) ──▶ PostgreSQL, object storage, clamd
                     worker (email outbox; probes on :4200) ──▶ PostgreSQL (worker role), SMTP provider
```

| Component       | Image                               | Port                      | Depends on                                       | Status                                       |
| --------------- | ----------------------------------- | ------------------------- | ------------------------------------------------ | -------------------------------------------- |
| web             | `infra/docker/web.Dockerfile`       | 3000                      | api, PostgreSQL                                  | Built                                        |
| api             | `infra/docker/api.Dockerfile`       | 4000                      | PostgreSQL, IdP, object storage, malware scanner | Built                                        |
| worker          | `infra/docker/worker.Dockerfile`    | 4200 (probes only)        | PostgreSQL (worker role), SMTP provider          | Built (sends `notify.email_outbox`, ADR-012) |
| PostgreSQL 16+  | managed                             | 5432                      | —                                                | Required (ADR-002)                           |
| Redis           | managed                             | 6379                      | —                                                | Not needed yet (ADR-012; revisit with S7)    |
| Object storage  | S3-compatible, private bucket       | 443                       | —                                                | Required (R1-04; ADR-010) — product TBC (A6) |
| Email (SMTP)    | provider, in-region                 | 587 (STARTTLS) / 465      | —                                                | Required (R1-07, R1-13) — product TBC (A6)   |
| Malware scanner | ClamAV `clamd` (sidecar or service) | 3310 (TCP, internal only) | signature updates (freshclam)                    | Required (R1-04; ADR-010)                    |

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

| Name                         | Purpose                                                                                                                                       | Required | Default | Example                                              | Store             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ---------------------------------------------------- | ----------------- |
| `APP_ENV`                    | Environment name; tightens rules in `uat`/`prod`                                                                                              | Yes      | —       | `prod`                                               | Deployment config |
| `PORT`                       | HTTP listen port                                                                                                                              | No       | `4000`  | `4000`                                               | Deployment config |
| `LOG_LEVEL`                  | `fatal`…`trace`, `silent`                                                                                                                     | No       | `info`  | `info`                                               | Deployment config |
| `CORS_ALLOWED_ORIGINS`       | Comma-separated browser origins allowed to call the API. **Required and HTTPS-only in `uat`/`prod`**                                          | uat/prod | empty   | `https://hr.sirius.ae`                               | Deployment config |
| `TRUST_PROXY_HOPS`           | Number of proxies in front of the API (for client IP / rate limiting)                                                                         | No       | `1`     | `1`                                                  | Deployment config |
| `REQUEST_BODY_LIMIT_KB`      | Max JSON body size                                                                                                                            | No       | `100`   | `100`                                                | Deployment config |
| `RATE_LIMIT_WINDOW_MS`       | Rate-limit window                                                                                                                             | No       | `60000` | `60000`                                              | Deployment config |
| `RATE_LIMIT_MAX`             | Requests per caller (access token; IP when anonymous) per window on `/api/v1`. One page view of the dashboard is about 6 calls                | No       | `300`   | `300`                                                | Deployment config |
| `RATE_LIMIT_IP_MAX`          | Requests per client IP per window on `/api/v1`: a ceiling for the web server's whole traffic (all users come through it)                      | No       | `3000`  | `3000`                                               | Deployment config |
| `READINESS_CHECK_TIMEOUT_MS` | Per-dependency readiness timeout                                                                                                              | No       | `2000`  | `2000`                                               | Deployment config |
| `SHUTDOWN_TIMEOUT_MS`        | Hard deadline for graceful shutdown; must be **less** than the orchestrator's termination grace period                                        | No       | `25000` | `25000`                                              | Deployment config |
| `OIDC_ISSUER`                | Exact token issuer. Signing keys are discovered from `<issuer>/.well-known/openid-configuration` on first use. **HTTPS-only in `uat`/`prod`** | Yes      | —       | `https://login.microsoftonline.com/<tenant-id>/v2.0` | Deployment config |
| `OIDC_AUDIENCE`              | This API's identifier as it appears in the token `aud` claim (Entra: Application ID URI or client ID of the API registration)                 | Yes      | —       | `api://peopleforge`                                  | Deployment config |
| `OIDC_TENANT_ID`             | Directory (tenant) ID; tokens from any other tenant are refused                                                                               | Yes      | —       | `<tenant-guid>`                                      | Deployment config |
| `OIDC_ALLOW_HTTP`            | `true` only for the local Keycloak over plain HTTP. Refused in `uat`/`prod`                                                                   | No       | `false` | `false`                                              | Deployment config |
| `OIDC_TIMEOUT_MS`            | Timeout for each request to the identity provider (discovery, key set)                                                                        | No       | `5000`  | `5000`                                               | Deployment config |

| `DATABASE_URL` | PostgreSQL connection as the **app role** `peopleforge_app` (data access only, no DDL, no `BYPASSRLS`; ADR-002) | Yes | — | `postgres://peopleforge_app:…@db:5432/peopleforge` | Secrets manager |
| `DATABASE_POOL_MAX` | Connection pool size per replica | No | `10` | `10` | Deployment config |
| `DATA_ENCRYPTION_KEYS` | Salary field keys, `id:base64-32-bytes,…` (ADR-008): the API encrypts and decrypts salaries and proposals. Must include every key the data was written with | Yes | — | `2026-10:…` | Secrets manager (KMS-backed, A6) |
| `DATA_ENCRYPTION_ACTIVE_KEY` | Key ID used for new writes | Yes | — | `2026-10` | Secrets manager |
| `OBJECT_STORE_DRIVER` | `s3` (any S3-compatible store), or `filesystem` for dev/test only. **`s3` only in `uat`/`prod`** | Yes | — | `s3` | Deployment config |
| `OBJECT_STORE_DIR` | Directory for the `filesystem` driver (dev/test) | With `filesystem` | — | `/tmp/peopleforge-evidence` | Deployment config |
| `OBJECT_STORE_TIMEOUT_MS` | Timeout per storage call (connect ≤ 3 s); the SDK retries up to 3 attempts with backoff, behind a circuit breaker | No | `10000` | `10000` | Deployment config |
| `S3_ENDPOINT` | Endpoint of an S3-compatible store; empty for AWS S3 itself. **HTTPS-only in `uat`/`prod`** | No | — | `https://objects.<region-provider>` | Deployment config |
| `S3_REGION` | Region of the bucket (must be the approved region) | With `s3` | — | `me-central-1` | Deployment config |
| `S3_BUCKET` | Private bucket for evidence files: no public access, versioning on, default encryption on | With `s3` | — | `peopleforge-evidence-prod` | Deployment config |
| `S3_ACCESS_KEY_ID` | Credentials limited to `s3:PutObject`, `GetObject`, `DeleteObject`, `ListBucket` (for `HeadBucket`) on that bucket | With `s3` | — | — | Secrets manager |
| `S3_SECRET_ACCESS_KEY` | As above | With `s3` | — | — | Secrets manager |
| `S3_FORCE_PATH_STYLE` | Path-style URLs; most S3-compatible stores need `true` | No | `true` | `true` | Deployment config |
| `MALWARE_SCANNER` | `clamav`, or `none` for local development only (files recorded with engine `none`). **`clamav` only in `uat`/`prod`** | Yes | — | `clamav` | Deployment config |
| `CLAMAV_HOST` | clamd host (TCP) | With `clamav` | — | `clamav` | Deployment config |
| `CLAMAV_PORT` | clamd port | No | `3310` | `3310` | Deployment config |
| `CLAMAV_TIMEOUT_MS` | Timeout per scan; a timeout refuses the upload with 503 (nothing is stored) | No | `15000` | `15000` | Deployment config |

The API holds **no identity secret**: it only verifies tokens against the provider's published public keys. Its database password and storage credentials come from the secrets manager.

**Readiness:** `/health/ready` checks `database` (one `SELECT 1`), `object_store` (`HeadBucket`, or the directory for `filesystem`) and `malware_scanner` (clamd `PING`). A replica that can't reach any of them is taken out of rotation, because it couldn't accept evidence uploads (R1-04).

**Uploads (R1-04, ADR-010):** evidence files reach the API as `multipart/form-data` of at most 10 MB per file (`MAX_EVIDENCE_FILE_MB`, a criterion can only lower it). They are held in memory — never on the API's disk — checked by content type, scanned by clamd, then written to the bucket under a random key. Size the API's memory for concurrent uploads (10 MB each, plus the copy sent to clamd). Any reverse proxy or ingress in front of **web** must accept request bodies of **11 MB** (e.g. nginx `client_max_body_size 11m;`), and in front of **api** likewise; Next.js itself is configured for 11 MB (`next.config.ts`). clamd's `StreamMaxLength` must be ≥ 10 MB (default 25 MB). Downloads stream through the API after an authorisation check: the bucket is never reachable from a browser. The web app waits up to 60 s for an upload's answer (send, check, scan); load balancer idle timeouts on the web and api paths must be at least that.

**Network:** the API must reach `OIDC_ISSUER` over HTTPS (egress to `login.microsoftonline.com` for Entra ID). If it can't, signed-in requests get 503 and a warning is logged.

### web

| Name                      | Purpose                                         | Required | Default     | Example   | Store |
| ------------------------- | ----------------------------------------------- | -------- | ----------- | --------- | ----- |
| `NEXT_TELEMETRY_DISABLED` | Must be `1` (data residency) — set in the image | Yes      | `1` (image) | `1`       | Image |
| `PORT`                    | Listen port                                     | No       | `3000`      | `3000`    | Image |
| `HOSTNAME`                | Bind address                                    | No       | `0.0.0.0`   | `0.0.0.0` | Image |

Validated on the first request (so `next build` needs no secrets); a bad value fails that request and logs the offending **key names** only.

| Name                         | Purpose                                                                                               | Required | Default                | Example                                                                | Store             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | -------- | ---------------------- | ---------------------------------------------------------------------- | ----------------- |
| `APP_ENV`                    | Environment name; `uat`/`prod` require HTTPS for `AUTH_URL` and `OIDC_ISSUER`                         | Yes      | —                      | `prod`                                                                 | Deployment config |
| `LOG_LEVEL`                  | `fatal`…`trace`, `silent`                                                                             | No       | `info`                 | `info`                                                                 | Deployment config |
| `AUTH_SECRET`                | Signs and encrypts session cookies and stored provider tokens (≥ 32 chars; `openssl rand -base64 48`) | Yes      | —                      | —                                                                      | Secrets manager   |
| `AUTH_URL`                   | Public origin of the web app; the OIDC redirect URI is `<AUTH_URL>/api/auth/oauth2/callback/sirius`   | Yes      | —                      | `https://hr.sirius.ae`                                                 | Deployment config |
| `OIDC_ISSUER`                | Identity provider issuer (Entra ID v2.0 endpoint)                                                     | Yes      | —                      | `https://login.microsoftonline.com/<tenant-id>/v2.0`                   | Deployment config |
| `OIDC_TENANT_ID`             | Tenant; sign-ins from any other tenant are refused                                                    | Yes      | —                      | `<tenant-guid>`                                                        | Deployment config |
| `OIDC_ALLOW_HTTP`            | `true` only for local Keycloak; refused in `uat`/`prod`                                               | No       | `false`                | `false`                                                                | Deployment config |
| `OIDC_CLIENT_ID`             | Web app registration's client ID                                                                      | Yes      | —                      | `<guid>`                                                               | Deployment config |
| `OIDC_CLIENT_SECRET`         | Web app registration's client secret                                                                  | Yes      | —                      | —                                                                      | Secrets manager   |
| `OIDC_SCOPES`                | Scopes requested at sign-in; must include the API scope so the access token's `aud` is the API        | No       | `openid profile email` | `openid profile email offline_access api://peopleforge/access_as_user` | Deployment config |
| `DATABASE_URL`               | PostgreSQL as the app role; sessions live in schema `auth`                                            | Yes      | —                      | `postgres://peopleforge_app:…@db:5432/peopleforge`                     | Secrets manager   |
| `DATABASE_POOL_MAX`          | Pool size per replica                                                                                 | No       | `10`                   | `10`                                                                   | Deployment config |
| `PEOPLEFORGE_API_URL`        | API origin, called server-side only (never from the browser)                                          | Yes      | —                      | `http://api:4000`                                                      | Deployment config |
| `PEOPLEFORGE_API_TIMEOUT_MS` | Timeout for each API call                                                                             | No       | `5000`                 | `5000`                                                                 | Deployment config |

### worker

Validated at startup like the API's (key names only, exit code 1). Runs as a long-lived service with one or more replicas (§11).

| Name                         | Purpose                                                                                                                                                      | Required    | Default       | Example                                               | Store             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------- | ----------------------------------------------------- | ----------------- |
| `APP_ENV`                    | Environment name; `uat`/`prod` require SMTP with TLS and an HTTPS `PORTAL_URL`                                                                               | Yes         | —             | `prod`                                                | Deployment config |
| `LOG_LEVEL`                  | `fatal`…`trace`, `silent`                                                                                                                                    | No          | `info`        | `info`                                                | Deployment config |
| `HEALTH_PORT`                | Probe port (`/health/live`, `/health/ready`); no other traffic                                                                                               | No          | `4200`        | `4200`                                                | Deployment config |
| `WORKER_DATABASE_URL`        | PostgreSQL as the **worker role** `peopleforge_worker` (reads the outbox, notifications, role mailboxes and the address view; updates delivery columns only) | Yes         | —             | `postgres://peopleforge_worker:…@db:5432/peopleforge` | Secrets manager   |
| `DATABASE_POOL_MAX`          | Pool size per replica                                                                                                                                        | No          | `4`           | `4`                                                   | Deployment config |
| `PORTAL_URL`                 | The web app's public origin, for the link in each email. **HTTPS-only in `uat`/`prod`**                                                                      | Yes         | —             | `https://hr.sirius.ae`                                | Deployment config |
| `EMAIL_TRANSPORT`            | `smtp`, or `file` (each email as an `.eml` file) for dev/test only. **`smtp` only in `uat`/`prod`**                                                          | Yes         | —             | `smtp`                                                | Deployment config |
| `EMAIL_FILE_DIR`             | Folder for the `file` transport                                                                                                                              | With `file` | —             | `/tmp/peopleforge-mail`                               | Deployment config |
| `EMAIL_FROM`                 | Sender address (one plain address), agreed with Sirius IT (A6); SPF/DKIM/DMARC for its domain must authorise the provider                                    | Yes         | —             | `no-reply@hr.sirius.ae`                               | Deployment config |
| `EMAIL_FROM_NAME`            | Sender display name                                                                                                                                          | No          | `PeopleForge` | `Sirius HR (PeopleForge)`                             | Deployment config |
| `SMTP_HOST`                  | Provider's SMTP host (in the approved region)                                                                                                                | With `smtp` | —             | `smtp.<provider>`                                     | Deployment config |
| `SMTP_PORT`                  | 587 (STARTTLS) or 465 (implicit TLS)                                                                                                                         | No          | `587`         | `587`                                                 | Deployment config |
| `SMTP_SECURE`                | `true` for implicit TLS (465)                                                                                                                                | No          | `false`       | `false`                                               | Deployment config |
| `SMTP_REQUIRE_TLS`           | Refuse to send unless STARTTLS succeeds. **`SMTP_SECURE` or this must be `true` in `uat`/`prod`**; only local Mailpit runs without                           | No          | `true`        | `true`                                                | Deployment config |
| `SMTP_USER`                  | SMTP login; set with `SMTP_PASSWORD` or not at all                                                                                                           | No          | —             | —                                                     | Secrets manager   |
| `SMTP_PASSWORD`              | As above                                                                                                                                                     | No          | —             | —                                                     | Secrets manager   |
| `SMTP_TIMEOUT_MS`            | Connect, greeting and socket timeout per email                                                                                                               | No          | `10000`       | `10000`                                               | Deployment config |
| `OUTBOX_POLL_MS`             | Wait between polls when nothing is due                                                                                                                       | No          | `5000`        | `5000`                                                | Deployment config |
| `OUTBOX_BATCH_SIZE`          | Emails claimed per batch (sent one at a time)                                                                                                                | No          | `10`          | `10`                                                  | Deployment config |
| `OUTBOX_MAX_ATTEMPTS`        | Attempts before an email is marked dead (backoff 1 min, 5 min, 30 min, 2 h, 6 h)                                                                             | No          | `6`           | `6`                                                   | Deployment config |
| `OUTBOX_LEASE_MS`            | How long a claimed batch is held; must be ≥ `OUTBOX_BATCH_SIZE` × `SMTP_TIMEOUT_MS` × 2                                                                      | No          | `300000`      | `300000`                                              | Deployment config |
| `OUTBOX_STATS_INTERVAL_MS`   | How often `email_outbox_stats` is logged                                                                                                                     | No          | `60000`       | `60000`                                               | Deployment config |
| `OUTBOX_ALERT_AFTER_S`       | `email_outbox_alert` when the oldest due email has waited longer than this (or any is dead)                                                                  | No          | `900`         | `900`                                                 | Deployment config |
| `REMINDER_INTERVAL_MS`       | How often the reminder triggers are checked (`notify.queue_reminders()`, ADR-014); also once at start                                                        | No          | `900000`      | `900000`                                              | Deployment config |
| `READINESS_CHECK_TIMEOUT_MS` | Per-dependency readiness timeout                                                                                                                             | No          | `2000`        | `2000`                                                | Deployment config |
| `SHUTDOWN_TIMEOUT_MS`        | Hard deadline for graceful shutdown (finishes the email in progress); less than the termination grace period                                                 | No          | `25000`       | `25000`                                               | Deployment config |

**Readiness:** `/health/ready` checks `database` (`SELECT 1`) and `email` (SMTP connect, TLS and login, or the folder for `file`). **Liveness:** `/health/live` is 503 when no batch has succeeded for three lease periods, so the orchestrator restarts a stuck worker.

**Network:** egress from the worker to `SMTP_HOST:SMTP_PORT` only (plus PostgreSQL). It needs no ingress except the probes.

**Role mailboxes (R1-07):** email to "all Sirius HR reviewers" goes to the mailbox configured for the role in `notify.role_mailbox` (a shared mailbox or distribution list, A6). Until the admin screen exists (S7), the DBA sets it (runbook `docs/runbooks/email-outbox.md`):

```sql
INSERT INTO notify.role_mailbox (role, address, updated_by)
VALUES ('PeopleForge.Reviewer', 'sirius-hr-reviewers@<sirius-domain>', '<name>');
```

Without a row, reviewers still see the notification in the portal; the email is skipped and logged (`email_skipped`, `no_address`).

### Migration job (`@peopleforge/db`, one-off before each rollout)

| Name                         | Purpose                                                                                    | Required  | Default              | Store                            |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------- | -------------------- | -------------------------------- |
| `DATABASE_OWNER_URL`         | Schema **owner** connection (DDL). Used only by the migration job, never by `api` or `web` | Yes       | —                    | Secrets manager                  |
| `DATABASE_APP_ROLE`          | Role granted data access by the migrations                                                 | No        | `peopleforge_app`    | Deployment config                |
| `DATABASE_WORKER_ROLE`       | The email worker's role, granted outbox access by the migrations (ADR-012)                 | No        | `peopleforge_worker` | Deployment config                |
| `APP_ENV`                    | The synthetic seed refuses anything but `dev`/`test`                                       | Seed only | —                    | Deployment config                |
| `DATA_ENCRYPTION_KEYS`       | Salary field keys (ADR-008) for the dev/test seed; same values as the API's                | Seed only | —                    | Secrets manager (KMS-backed, A6) |
| `DATA_ENCRYPTION_ACTIVE_KEY` | Key ID used for new writes; older IDs stay in the list until re-encryption finishes        | Seed only | —                    | Secrets manager                  |

**Key loss means salary loss** (ADR-008): back up every data key in the secrets manager before first use, and never remove an ID from `DATA_ENCRYPTION_KEYS` while rows still use it.

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
2. Run database migrations (§6).
3. Roll out `api`, wait for `/health/ready` = 200 on all replicas.
4. Roll out `web`.
5. Run the smoke tests (§10).
6. Record the deployed SHA and time in the release log.

## 6. Database migrations and rollback

Hand-written SQL (`NNNN_name.up.sql` / `.down.sql`) applied by the shared runner in `packages/db` (ADR-002). Each migration runs in its own transaction under an advisory lock, so two jobs never migrate at once. Applied names are recorded per module in `migrations.core` and `migrations.web`.

**One-time database setup** (by the DBA, per environment):

```sql
CREATE ROLE peopleforge_owner LOGIN PASSWORD '…';   -- owns the schemas, runs migrations
CREATE ROLE peopleforge_app   LOGIN PASSWORD '…';   -- used by api and web; no DDL, no BYPASSRLS
CREATE ROLE peopleforge_worker LOGIN PASSWORD '…';  -- the email worker: outbox only (ADR-012)
CREATE DATABASE peopleforge OWNER peopleforge_owner;
REVOKE CONNECT ON DATABASE peopleforge FROM PUBLIC;
GRANT CONNECT ON DATABASE peopleforge TO peopleforge_app, peopleforge_worker;
```

**Per release:**

1. Take an on-demand backup / snapshot.
2. Run the migrations as a one-off job with `DATABASE_OWNER_URL`, **core first, then web** (the web schema may reference core later):

   ```bash
   pnpm --filter @peopleforge/db migrate          # migrations/core
   pnpm --filter @peopleforge/web db:migrate      # apps/web/db/migrations (schema auth)
   ```

   Status: `pnpm --filter @peopleforge/db migrate:status`, `pnpm --filter @peopleforge/web db:status`.

   **Where the job runs — TBC (A6).** The `api` image already contains the core migrations (`node_modules/@peopleforge/db`), so core can run from it: `node node_modules/@peopleforge/db/dist/cli/migrate.js core up` with `DATABASE_OWNER_URL` set. The web `auth` migrations are not in any image yet; until a dedicated migration image is agreed, run them from a checkout of the released tag on an in-region runner.

3. Roll out `api`, then `web`.
4. Migrations are expand/contract, so the previous API version keeps working against the new schema.

**Rollback:** redeploy the previous images first. Revert a migration only if it must be undone, one at a time, newest first: `pnpm --filter @peopleforge/web db:rollback`, `pnpm --filter @peopleforge/db migrate:rollback`.

**Release S4a — migration `0005_submission_audit_notifications`:** adds the `submitted` status, `increments.status_event`, the `audit` schema (`audit.audit_log`) and the `notify` schema (notifications, read state, email outbox). It is additive and takes only short locks (one CHECK swap on `increment_request`). No new env vars. Things to know:

- `audit.audit_log` and `increments.status_event` are **append-only**: a trigger refuses `UPDATE`, `DELETE` and `TRUNCATE` for every role, the owner included (ADR-011). Don't plan maintenance that deletes from them; retention will be handled by partitioning and archiving.
- Rolling back `0005` **drops the audit trail, the status history and all notifications**, and turns submitted requests back into drafts. Export `audit.audit_log` first (`COPY … TO`) if it holds anything from UAT/Prod that must be kept.
- Emails are queued in `notify.email_outbox` but **not sent** until the worker and the email provider arrive (S4b, A6). Users see notifications in the portal meanwhile.
- The submission deadline is a business **date** compared in Asia/Dubai (`BUSINESS_TIME_ZONE` in `@peopleforge/contracts`): a request can be submitted until the end of the deadline day, Dubai time. The placeholder cycle's deadline is 30 Nov 2026.

**Release S4b-1 — migration `0006_dashboard`:** adds `increment_request.status_changed_at` (backfilled, then `NOT NULL`), a cycle index, and trigram indexes for the dashboard search. **It enables the `pg_trgm` extension** (`CREATE EXTENSION IF NOT EXISTS pg_trgm`). `pg_trgm` is a trusted extension, so the database owner can create it without superuser rights. On managed PostgreSQL it must be allowed first: on Azure Database for PostgreSQL add `PG_TRGM` to the `azure.extensions` server parameter; on Amazon RDS it is available by default. The index builds take a short lock on `request_line` and `increment_request`. That is fine at Phase 1 volumes; for large tables, create them `CONCURRENTLY` by hand before the release. No new env vars. Rolling back drops the column and indexes and leaves the extension (it holds no data).

**Release S4c — migration `0007_submitter_name`:** adds the nullable column `increment_request.submitted_by_name` with a length CHECK. Adding a nullable column without a default is a catalogue-only change (no table rewrite, a brief lock). Existing submitted requests keep `null` and their page leaves out "by …". No new env vars. Rolling back drops the column.

**Release S4b-2 — migrations core `0008_email_worker` and web `0002_recipient_email`:** **create the role `peopleforge_worker` first** (one-time setup above; the migration stops with "Role … does not exist" otherwise). 0008 adds delivery columns to `notify.email_outbox` (`status`, `next_attempt_at`, `message_id`; catalogue-only adds, no rewrite), swaps its pending index, creates `notify.role_mailbox`, and grants the worker role its narrow access. Web 0002 adds the view `auth.recipient_email` (account ID → email) for the worker. Run core first, then web, as always. Then deploy the worker (new service, `infra/docker/worker.Dockerfile`) and set the reviewers' mailbox (§4 worker). Emails queued since S4a are sent when the worker starts: before the first start in a shared environment, decide whether old ones should go (runbook, "Requeue", in reverse: mark them `skipped`). Rolling back: stop the worker, then roll back web 0002 and core 0008.

**Release S5a — migration `0009_review_decisions`:** widens the `increment_request` status CHECK (`under_review`, `returned`, `approved`, `partly_approved`, `rejected`), adds `increment_request.decided_at` with a CHECK tying it to the final statuses, adds `request_line.review_status` (`NOT NULL DEFAULT 'pending'`: a catalogue-only change on PostgreSQL 11+, no rewrite) and `review_changed_at`, and creates `increments.criterion_verification` and the append-only `increments.line_decision` (both under Row-Level Security) plus a partial index for the review queue. Short locks only (two CHECK swaps on `increment_request`). No new env vars, services or ports. Existing submitted requests become reviewable as they are. Rolling back: the down migration drops the two tables, the columns and the index and puts every review status back to `submitted` (decisions are lost: take a backup first in a shared environment).

**Release S5b — migration `0010_conversations`:** creates the append-only, RLS-protected `increments.line_message` (questions and answers per employee, text encrypted with the existing data key) and its indexes. Additive; no locks on existing tables. No new env vars, services or ports. Rolling back drops the table (every conversation is lost: back up first in a shared environment).

**Release S6 — migration `0011_history_reports`:** adds the nullable `audit.audit_log.actor_name` with a default read from the session setting `app.user_name` (a catalogue-only add on PostgreSQL 11+: the default is a stable expression, evaluated once for existing rows — null, as the migration has no user — so no rewrite and no update of the append-only rows), the read policy `audit_read_entity` (a subsidiary reads its own entity's audit rows, for a request's History), and the partial expression index `audit_log_request_idx`. The index build takes a short `SHARE` lock on `audit_log` (writes wait while it builds); at Phase 1 volumes that is seconds — for a large trail create it `CONCURRENTLY` by hand before the release. No new env vars, services or ports. **New API dependencies:** `exceljs` 4.4.0 and `pdfkit` 0.20.2 with the Noto Sans and Noto Sans Arabic fonts (`@fontsource/*`, bundled in the image, no network at runtime); the workspace pins `exceljs > uuid` to 11.1.1 (`pnpm-workspace.yaml` overrides) for a security fix. Reports are built in memory (≤ 20,000 employees, a few MB); the web app allows 60 s for a report download (`REPORT_TIMEOUT_MS`), so a proxy or ingress in front of the web app must not cut responses earlier. Rolling back drops the policy, index and column (recorded names are lost; actions stay).

**Release S7a — migration `0012_settings_reminders`:** creates `notify.reminder_rule` (seeded with the default triggers: review 2 days, return 2 days, deadline 3 days), `notify.reminder_log`, and the function `notify.queue_reminders()` (`SECURITY DEFINER`, `EXECUTE` for the worker role only), and grants the app role `SELECT` and a column-limited `UPDATE` on the rules. Additive, no locks on existing tables. Needs the worker role (created for S4b-2). New optional worker env var `REMINDER_INTERVAL_MS` (default 15 min). Deploy order: migrate, then the API (Settings routes; the Review queue reads the rule), then the worker (it calls the function; an older worker simply doesn't). The first check after deployment reminds about everything already overdue, once each. Rolling back drops the function and both tables (reminders stop; criteria versions published meanwhile stay).

**Release S7b — no migration.** New API routes (`/analytics/increments`, `/reports/tat-back-and-forth`) and the web `/analytics` page. Analytics are computed in the API per request from indexed reads (ADR-006); include `/analytics` (largest cycle, every subsidiary) in the pre-UAT load test against NFR-PERF-01 (< 3 s). No new env vars, services or ports.

**Release S8–S9 — migrations `0013_group_data` and `0014_data_quality`:** create the schema `groupdata` (field template v1 with placeholder fields, grade bands, uploads, the period-partitioned and append-only `employee_snapshot` with yearly partitions 2024–2028 and a default, `period_version`, `period_summary`, anomaly rules ANM-01 … ANM-09 and flags), the function `groupdata.employee_numbers_elsewhere` (app role) and `notify.queue_group_reminders()` (worker role), and extend `notify.reminder_rule` with `upload_due` and `flag_open` (5 days each). Additive: no locks on existing tables except a CHECK swap on `notify.reminder_rule` (a few rows). Needs the worker role (S4b-2). No new env vars, services or ports. Uploaded files go to the existing object store under `group-uploads/{entity}/{upload}` and are scanned like evidence (ADR-010): size the bucket for one file per subsidiary per month (≤ 5 MB each) plus corrections. The web app's Server Action limit (`MAX_EVIDENCE_FILE_MB` + 1 MB) already covers the 5 MB upload; a proxy in front of the web app must allow at least 6 MB bodies and 60 s for uploads (scan + checks). Deploy order: migrate, API, web, then the worker (it now also calls `queue_group_reminders`; an older worker simply doesn't). **Yearly task:** before 1 Jan 2029 add the next partition (`CREATE TABLE groupdata.employee_snapshot_y2029 PARTITION OF groupdata.employee_snapshot FOR VALUES FROM ('2029-01-01') TO ('2030-01-01')` — rows already in the default partition for that year must be moved first). Rolling back `0014` drops the rules, flags and the group reminders; rolling back `0013` drops the whole `groupdata` schema (**every upload, version and record is lost**: back up first) — uploaded files stay in storage and must be removed separately. The employee master (`core.employee`) is refreshed from the newest accepted month: in a shared environment, upload a subsidiary's real employee list only when its increment requests may use it.

**Never in UAT or Prod:** `pnpm db:seed` (synthetic data; it refuses unless `APP_ENV` is `dev` or `test`). Production configuration (real entities, assignments, criteria) is entered through the admin screens once they exist. Until then (A1/A3 pending) the core migrations include the clearly marked `[Placeholder]` criteria set and increment cycle (R1-05).

## 7. Health endpoints

| Endpoint                            | Use                                                        | Healthy                                                                |
| ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /health/live` (api)            | Liveness probe                                             | `200 {"status":"alive"}`                                               |
| `GET /health/ready` (api)           | Readiness probe; checks each dependency with a timeout     | `200`; `503` if any dependency is down **or the instance is draining** |
| `GET /` (web)                       | Liveness/readiness                                         | `200`                                                                  |
| `GET /health/live` (worker, :4200)  | Liveness: a batch has succeeded within three lease periods | `200 {"status":"live"}`; `503` when stalled                            |
| `GET /health/ready` (worker, :4200) | Readiness: `database` and `email` (SMTP login / folder)    | `200`; `503` with the failing check named                              |

Recommended probes: liveness every 15 s, failure threshold 3; readiness every 5 s, failure threshold 2. Health endpoints are unauthenticated and not rate limited; they expose dependency names and up/down only. Block `/health/*` at the public load balancer if it is internet-facing.

**Worker shutdown:** on `SIGTERM` the worker stops claiming, finishes the email in progress, closes the probe port and the database pool, then exits; past `SHUTDOWN_TIMEOUT_MS` it exits with code 1. Emails it had claimed but not sent are taken again when their lease ends.

**Graceful shutdown:** on `SIGTERM` the API makes readiness return 503, stops accepting connections, finishes in-flight requests, closes dependencies, then exits. If draining exceeds `SHUTDOWN_TIMEOUT_MS` it exits with code 1. Set the orchestrator's termination grace period above this value (e.g. 30 s for the 25 s default).

## 8. Monitoring, logging and alerting

- **Logs:** JSON lines on stdout, one per request plus application events. Every line carries `service` and request ID (`X-Request-Id` is accepted from upstream if safe, otherwise generated, and returned on every response). Request logs contain method, path (no query string), status and duration — no headers, bodies, tokens, PII or salary values. Ship to the in-region log store; retention TBC with Sirius (NFR-PRIV-01).
- **Metrics/tracing:** OpenTelemetry instrumentation is added with the first database-backed feature; exporter endpoint must be in-region.
- **Alerts (initial):** readiness failing > 2 min; 5xx rate > 1% over 5 min; p95 latency > 3 s on dashboard endpoints (NFR-PERF-01); container restarts > 3 in 15 min; certificate expiry < 21 days.
- **Reminders (worker, ADR-014):** alert on `reminders_failed` repeating for an hour; `reminders_queued` logs the count per check.
- **Email (worker, ADR-012):** alert on any `email_outbox_alert` log line (emails dead, or the oldest due one waiting longer than `OUTBOX_ALERT_AFTER_S`) and on `email_batch_failed` repeating for 5 minutes; chart `email_outbox_stats` (`pending`, `due`, `dead`, `oldestDueSeconds`). Logs name outbox row IDs and roles, never addresses. Runbook: `docs/runbooks/email-outbox.md`.
- **Availability target:** ≥ 99% during business hours (NFR-AVAIL-01). Business hours and maintenance windows: TBC with Sirius HR.

## 9. Backup and disaster recovery

TBC (A6), proposed targets for agreement:

- PostgreSQL: continuous WAL archiving + daily snapshots, 35-day retention, in-region; quarterly restore test.
- Object storage (evidence files, ADR-010): versioning enabled; cross-zone replication within the region; same retention as the database rows that reference them. Removing a file in the app is a soft delete: the object stays until the retention rule (Q10) is agreed and a purge job exists.
- RPO ≤ 15 min, RTO ≤ 4 business hours.
- DR runbook: `docs/runbooks/` (to be written with ADR-001 hosting). Salary data keys (ADR-008) must be restorable with the database: a backup without its keys is unreadable.

## 10. Post-deployment smoke test

- [ ] `GET /health/live` and `/health/ready` return 200 on every API replica.
- [ ] `GET /api/v1/me` without a session returns 401 in the standard error shape with `X-Request-Id`.
- [ ] Home page loads over HTTPS; response has `Content-Security-Policy` with a `nonce-` and `Strict-Transport-Security`.
- [ ] `GET /health/ready` shows `"database":"up"`, `"object_store":"up"` and `"malware_scanner":"up"`.
- [ ] As a Subsidiary HR test user, Home shows **My increment requests** with the cards, "Needs your action" for a draft, and the draft in the table; searching its reference narrows the list; **By employee** → **View Status** opens the employee's page. A user of another subsidiary searching that reference finds nothing.
- [ ] As a Subsidiary HR test user, complete a draft and **Submit to Sirius HR** → the request detail page opens with "Where this request is" at Criterion 1 ("Sirius HR reviewing") and is read-only; the bell shows 1 unread. As a Sirius HR reviewer, the notifications page lists "New request from …", and View opens it.
- [ ] On a draft: attach a small PDF to a criterion → it appears and downloads; attaching the EICAR test file (inside a PDF) is refused by the malware scan.
- [ ] As a Subsidiary HR test user: New Request → add an employee → the draft opens with their current salary; save a 5% proposal and see the new monthly salary.
- [ ] Signing in as a Subsidiary HR test user shows only their subsidiary in the sidebar; a Sirius HR user sees "All subsidiaries".
- [ ] Group data (synthetic test subsidiary only): **Upload data** → download the template, upload it with one blank Employee ID → "Rejected: nothing changed" with the row listed; upload a correct file → "Accepted as version 1"; **Employee data** lists the rows; another subsidiary's user sees none of them. As Sirius HR, **Raw data extract** downloads a CSV that opens in Excel with Arabic names intact.
- [ ] Language switch to العربية sets `<html dir="rtl">`, and back.
- [ ] Worker: `GET :4200/health/ready` shows `"database":"up"` and `"email":"up"`. After the submit above, the submitter's mailbox and the reviewers' mailbox each receive an email with the reference and a working "View in PeopleForge" link; the worker logs `email_sent` twice.
- [ ] No errors in logs for the deployed version during the first 10 minutes.

## 11. Scaling

- `web` and `api` are stateless; scale horizontally behind the load balancer.
- `worker`: one replica is enough for Phase 1 volumes; a second for availability is safe (rows are claimed with `SKIP LOCKED`, ADR-012). Raise `OUTBOX_BATCH_SIZE` (and the lease) before adding replicas for throughput.
- **Before running more than one API replica**, move the rate limiter to a shared Redis store — the current in-memory store limits per replica only.
- Start with 2 replicas each in UAT/Prod for availability; size from the load test (ADR-004) before UAT.

## 12. Troubleshooting

| Symptom                                                                                                                          | Likely cause                                                                                                                                                                         | Action                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| API exits immediately with `Invalid or missing environment variables: …` (e.g. `DATA_ENCRYPTION_KEYS (Key k1 must be 32 bytes)`) | Config validation failed                                                                                                                                                             | Fix the listed keys (§4)                                                                                            |
| Browser shows CORS errors                                                                                                        | Web origin not in `CORS_ALLOWED_ORIGINS`                                                                                                                                             | Add the exact origin (scheme + host + port)                                                                         |
| All clients rate-limited at once                                                                                                 | `RATE_LIMIT_IP_MAX` too low for the web server's total traffic (every user's calls come from its IP), or `TRUST_PROXY_HOPS` wrong so every request appears to come from the proxy IP | Raise `RATE_LIMIT_IP_MAX` to the expected peak; set `TRUST_PROXY_HOPS` to the number of proxies in front of the API |
| Readiness flaps during deploys                                                                                                   | Grace period shorter than `SHUTDOWN_TIMEOUT_MS`                                                                                                                                      | Increase the grace period                                                                                           |
| Outbound connections to `telemetry.vercel.com`                                                                                   | Telemetry not disabled in a custom image                                                                                                                                             | Set `NEXT_TELEMETRY_DISABLED=1`                                                                                     |
| Build fails with `ERR_PNPM_FETCH_401` / `404` on `@sirius/…`                                                                     | Registry token missing, wrong host in the token line, or package not published                                                                                                       | Check the `npmrc` build secret and `SIRIUS_REGISTRY` (§3); publish from js-platform                                 |
| `/api/v1/*` returns 401 with a valid-looking token                                                                               | The API log line `Access token rejected` gives the reason: `wrong_audience` (token not issued for `OIDC_AUDIENCE`), `wrong_issuer`, `wrong_tenant`, `expired`, `bad_signature`       | Fix the app registration or the `OIDC_*` values; never log the token itself                                         |
| Signed-in requests return 503 `SERVICE_UNAVAILABLE`                                                                              | The API can't load the identity provider's discovery document or keys                                                                                                                | Check egress/DNS to `OIDC_ISSUER`, and that `OIDC_ISSUER` matches the provider's `issuer` exactly                   |
| `/health/ready` reports `"database":"down"`                                                                                      | Wrong `DATABASE_URL`, network policy, or the database is down                                                                                                                        | Check connectivity from the pod; the password is in the secrets manager                                             |
| `/health/ready` reports `"object_store":"down"`                                                                                  | Bucket missing, wrong `S3_*` values, credentials without `ListBucket`, or the store unreachable                                                                                      | Check the API log line `Dependency unavailable` (it names the SDK error, e.g. `NoSuchBucket`, `AccessDenied`)       |
| `/health/ready` reports `"malware_scanner":"down"`, or uploads fail with "Files can't be handled right now"                      | clamd not running, still loading signatures (first start takes minutes), or `CLAMAV_HOST`/`CLAMAV_PORT` wrong                                                                        | `echo PING \| nc <host> 3310` should answer `PONG`; wait for freshclam on first start                               |
| An upload fails with "That file is too large" below 10 MB, or the browser shows a network error                                  | A proxy in front of web or api limits request bodies                                                                                                                                 | Raise it to 11 MB (§4, Uploads)                                                                                     |
| Subsidiary HR user signs in but sees "No subsidiary assigned"                                                                    | No row in `core.user_entity` for their Entra object ID                                                                                                                               | Assign them (admin screen, later slice); locally: the seed assigns `pf.alpha.hr`/`pf.beta.hr`                       |
| Worker exits with `Invalid or missing environment variables: OUTBOX_LEASE_MS`                                                    | The lease is shorter than a batch of timeouts                                                                                                                                        | Raise `OUTBOX_LEASE_MS` or lower `OUTBOX_BATCH_SIZE` / `SMTP_TIMEOUT_MS` (§4 worker)                                |
| Migration fails with `Role "peopleforge_worker" does not exist`                                                                  | The worker role wasn't created (one-time setup, §6)                                                                                                                                  | Create it, grant `CONNECT`, run the migrations again                                                                |
| No emails arrive; worker logs `email_retry` / `email_dead` / `email_skipped`                                                     | Provider unreachable or refusing (`timeout`, `connection`, `smtp_auth`, `smtp_5xx`), or no address (`no_address`: role mailbox missing, or the user never signed in)                 | Runbook `docs/runbooks/email-outbox.md`                                                                             |
| `/api/v1/*` returns 401 without a token                                                                                          | Expected: every `/api/v1` route needs `Authorization: Bearer <access token>`                                                                                                         | Sign in through the web app, or use `scripts/token.sh` in local-infra                                               |
