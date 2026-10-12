# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.

## [Unreleased]

### Added

- Monorepo foundation: pnpm workspaces, Turborepo, strict TypeScript, ESLint (security, i18n and RTL rules), Prettier, Husky, commitlint.
- `@sirius-hr/shared-types`: API error shape, error codes, cursor pagination, health and locale schemas.
- `@sirius-hr/utils`: redacting JSON logger, CSV/Excel formula-injection guard, text normalisation.
- API: validated config (fail fast), security headers, CORS allow-list, rate limiting, request IDs, minimal request logging, health/readiness endpoints, deny-by-default `/api/v1`, `GET /api/v1/me`, global error handler, graceful shutdown.
- Web: Next.js App Router shell, nonce-based CSP, English/Arabic catalogues with RTL switch, loading/error/not-found states, skip link.
- Dockerfiles (multi-stage, non-root), CI pipeline, ADR-001, DEPLOYMENT.md, SECURITY.md, database conventions, traceability matrix, OpenAPI spec.
