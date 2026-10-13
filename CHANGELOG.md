# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.

## [Unreleased]

### Added — slice S1 (ADR-002, ADR-008)

- `packages/db` (`@peopleforge/db`): plain-SQL migrations for schemas `core` (entities, user → entity assignments, increment cycles, interim employee directory) and `increments` (criteria sets and criteria), Row-Level Security (`ENABLE` + `FORCE`) on every entity-owned table, `withScope` for per-transaction scope, typed Kysely access, AES-256-GCM field encryption for salaries bound to table/column/row, and a synthetic dev/test seed (refused in UAT/Prod). One migration runner shared with the web app (`migrations.core`, `migrations.web`). Root scripts `pnpm db:migrate`, `pnpm db:seed`.
- Placeholder configuration (R1-05): "Increment cycle 2026" and a five-criterion set marked `[Placeholder]`, to be replaced when Sirius provides the criteria (A1).
- `packages/access` (`@peopleforge/access`): roles, permissions and the `/me` contract shared by the API and web, so both change together.
- API: subsidiary HR users are scoped to their `core.user_entity` assignments (R1-01, R2-12); `GET /api/v1/me` returns the visible `entities`; `/health/ready` checks the database; new variables `DATABASE_URL`, `DATABASE_POOL_MAX`. Database outages answer 503, never an unscoped caller.
- Web: portal shell — dark sidebar with Home, New Request, Notifications and Reports filtered by permission, user block with initials, role and subsidiary, language switch and sign-out; responsive (sidebar becomes a header below 1024 px). New Request, Notifications and Reports are placeholders that answer 404 without the permission.
- Integration tests for Row-Level Security against a real PostgreSQL; E2E for the shell and entity scoping.

### Fixed

- `DEPLOYMENT.md` had been emptied by an earlier commit (614eaa3); restored and brought up to date (web and migration variables, migration procedure).

- Endless redirect between `/` and `/sign-in` after signing out at the identity provider: a session whose token can't be renewed is now ended via `/session-ended`.
- Sign-in screen spacing matches the Figma and never overflows the viewport, from short laptop screens to large monitors, tablet and phone (`@sirius/login-ui` 0.1.3). In `next dev` the Next.js dev badge is turned off: it was added below the page and made full-height screens scroll.

### Added

- R1 design proposal with BRD gap analysis: `docs/design/r1-increment-portal.md`.

- **Sign-in for the web app** (ADR-003): the shared Sirius sign-in screen (`@sirius/login-ui`, PeopleForge copy in `messages/en.json`), organisation sign-in through Keycloak locally / Entra ID later (`@sirius/auth-better`: OIDC code + PKCE, verified ID tokens, encrypted provider tokens, 8-hour HttpOnly session), "no access" screen for people without a PeopleForge role, sign-out that also ends the provider session, and the home page showing the identity the API confirms (`GET /api/v1/me`).
- Schema `auth` with migration `0001_auth_schema` (up/down), a migration runner (`pnpm --filter @peopleforge/web db:migrate | db:rollback | db:status`) and the data dictionary `docs/database/auth-schema.md`.
- Sign-in events in the web log: `sign_in_succeeded`, `sign_in_rejected` (reason), `sign_in_failed` (code), without personal data.
- End-to-end tests for sign-in, refusal and sign-out against a local test OpenID provider and a separate test database (`peopleforge_test`); CI runs them with a PostgreSQL service.

- The API now verifies OIDC access tokens (`Authorization: Bearer`) from the local Keycloak, shaped like Entra ID: issuer, audience `peopleforge-api`, tenant, signature and expiry are checked; signing keys are discovered from the issuer. New required variables `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_TENANT_ID` (DEPLOYMENT.md §4). ADR-003.
- `GET /api/v1/me` returns `username` and `name`; subsidiary HR users are entity-scoped with no entities until assignments exist.
- 503 `SERVICE_UNAVAILABLE` when the identity provider can't be reached.

### Changed

- The policy guard, decorators, start-up route audit and authentication middleware moved to `@sirius/auth-nest` 0.1.0 (js-platform) so every NestJS app shares them; PeopleForge keeps its permission matrix and principal mapping.

- Renamed to **PeopleForge**: workspaces `@peopleforge/api` and `@peopleforge/web`, images `peopleforge-api` / `peopleforge-web`, app name in the UI. The brand name is not translated, so Arabic falls back to "PeopleForge".
- `config`, `shared-types` and `utils` moved to the `js-platform` repository and are consumed as published `@sirius/*` 0.1.0 packages from the private registry (ADR-0007). Docker builds and CI need the registry URL and a read token.
- Removed two object-injection sinks in the access policy code (role lookup through a `Map`, handler lookup through `Reflect.get`); lint is warning-free.
- API moved from Express to NestJS 12 (ADR-005). Health, security headers, CORS, rate limiting, request IDs, logging, error shape and graceful shutdown behave as before. Entry point is now `dist/main.js`.

### Added

- Deny-by-default access policy: `@Public`, `@Authenticated`, `@RequirePermission` on every route, a global policy guard, and a start-up audit that refuses to boot if any route lacks a policy.
- Role → permission matrix for PeopleForge roles, with tests for separation of duties and executive data limits.
- `GET /api/v1/me` now returns the caller's effective permissions.
- Monorepo foundation: pnpm workspaces, Turborepo, strict TypeScript, ESLint (security, i18n and RTL rules), Prettier, Husky, commitlint.
- `@sirius/shared-types`: API error shape, error codes, cursor pagination, health and locale schemas.
- `@sirius/utils`: redacting JSON logger, CSV/Excel formula-injection guard, text normalisation.
- API: validated config (fail fast), security headers, CORS allow-list, rate limiting, request IDs, minimal request logging, health/readiness endpoints, deny-by-default `/api/v1`, `GET /api/v1/me`, global error handler, graceful shutdown.
- Web: Next.js App Router shell, nonce-based CSP, English/Arabic catalogues with RTL switch, loading/error/not-found states, skip link.
- Dockerfiles (multi-stage, non-root), CI pipeline, ADR-001, DEPLOYMENT.md, SECURITY.md, database conventions, traceability matrix, OpenAPI spec.
