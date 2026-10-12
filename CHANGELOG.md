# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.

## [Unreleased]

### Added

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
