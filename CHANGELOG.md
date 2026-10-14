# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.

## [Unreleased]

### Added — slice S3: criteria and evidence (R1-03, R1-04, R1-06)

- **Section 2 "Eligibility criteria"**, one employee at a time: Pass or Fail, a justification (up to 2,000 characters) and evidence files for each criterion. "Save draft" saves them together with the proposed increments. The row's pencil saves and opens the next employee, so nothing typed is lost. Fail needs the same justification and evidence as Pass.
- **Evidence files:** up to 5 per criterion, up to 10 MB each. The type is judged by content against the criterion's list, and every file goes through a ClamAV scan before it is stored. Infected and disguised files are refused. Files go to private S3-compatible storage under random keys. Choosing a file uploads it at once; files can be removed (soft delete), and downloads go through the API as attachments (ADR-010).
- **Completeness everywhere:** the Criteria column shows ✓/✗ once a criterion is complete and ○ before, with "n/5 complete". Each criterion shows "Complete" or "To complete: …".
- **Section 3 "Ready to submit?":** who is ready and what each other employee still needs. "Submit to Sirius HR" stays disabled until S4.
- `@peopleforge/integrations`: S3 object store (filesystem for dev/test), ClamAV adapter, content-type detection, file-name sanitising, circuit breaker, shared env schema. A protocol-level fake clamd is included for tests.
- Migration `0004_criteria_evidence`: `increments.criterion_result` (justification encrypted) and `increments.evidence_file`, both with Row-Level Security.
- API: `PUT /api/v1/increment-requests/{id}/draft`, `POST …/evidence` (multipart), `GET` and `DELETE …/evidence/{evidenceId}`. Readiness now also checks object storage and the malware scanner. New env vars `OBJECT_STORE_*`, `S3_*`, `MALWARE_SCANNER`, `CLAMAV_*` (DEPLOYMENT.md §4).
- Design system: `SegmentedChoice` tones and icons (Pass/Fail) and a `form` attribute; `FileChip`.

### Changed

- `PUT …/proposals` is replaced by `PUT …/draft` (it was never released). The request response now carries the criteria configuration, each line's `criteria` with `missing`, and `totals.ready`.
- The draft page has one "Save draft" form whose fields sit in different cards (the `form` attribute), so the Add-employee form stays separate.
- Uploads through the web app may take up to 60 s (sent, checked, scanned); proxies must accept 11 MB bodies.

### Fixed

- **An empty draft stayed under "Needs your action".** Removing a draft's last employee now discards the draft (soft delete). The user returns to Home with "Draft discarded: it had no employees left." A draft must also be created with at least one employee (`employeeIds` minItems 1). `DELETE …/lines/{lineId}` returns `{ discarded, request }`.
- **The chosen "% | AED" segment turned white on hover, hiding its white text.** The current language button had the same bug. Hover styles now apply only to unchosen segments and enabled buttons, and an end-to-end test checks the hovered background stays dark.

- Removing an employee from a draft failed with "Something went wrong". React overrides a button's `name` when its `formAction` is a function, so the line ID never reached the server. The ID is now bound to the action, and the tests cover it.
- The sidebar lost its selection while editing a draft (`/requests/<id>`). **New Request** now stays selected, as in the Figma.
- In `next dev`, the CSP blocked the Next.js dev overlay's inline styles. That filled the console with errors and set off the dev "Issues" badge. Development now allows inline styles; production keeps nonce-only styles.

### Changed

- The draft editor now follows the Figma:
  - the title stays "New increment request", with role · reference · Draft above it;
  - "Add employee" and "+ Add" sit at the right of the section header;
  - the table has larger "% | AED" and value controls;
  - a **Criteria** column (`CriteriaProgress`, "0/5 complete" until S3) replaces "New monthly", which is not in the Figma;
  - totals read "Employees: · Total proposed increase: · Average:".
- Design system: `CriteriaProgress`; `controlSize="lg"` for Input/Select; roomier cards (24 px); semibold names in tables.
- The request detail API includes the request's pinned `criteria`.
- End-to-end tests now fail on any browser console error or uncaught exception.

### Added — slice S2: draft increment requests (R1-02)

- Subsidiary HR can create a draft increment request for the open cycle and add employees from their subsidiary. Each employee's grade and monthly salary are snapshotted, encrypted. The request then takes a proposed increment per employee, as a % or as an amount in the salary currency. Totals show employees, total monthly increase per currency, and the average %. Employees can be removed, and drafts are listed under "Needs your action" on Home.
- Arithmetic uses decimal.js, never floating point. A % increment is rounded half-up to 2 decimals. Proposals must be above 0 and at most 100% (an amount up to the current salary). The average is the simple mean of the percentages, to 1 decimal. Worked examples are in `money.test.ts`.
- Migration `0003_increment_requests`, protected by:
  - Row-Level Security;
  - composite keys, so a line can only hold an employee of the request's own subsidiary;
  - per-cycle references `INC-2026-0001`;
  - idempotent creation (`Idempotency-Key`);
  - optimistic locking (`version`).
- API: `GET/POST /api/v1/increment-requests`, `GET …/{id}`, `POST …/{id}/lines`, `DELETE …/{id}/lines/{lineId}`, `PUT …/{id}/proposals`, `GET /api/v1/increment-cycles/open`, `GET /api/v1/employees`. New permission `increment_request:read` (Subsidiary HR and Reviewer). Drafts are hidden from Sirius until submitted. The API now needs `DATA_ENCRYPTION_KEYS` / `DATA_ENCRYPTION_ACTIVE_KEY`.
- Design system: `SegmentedChoice` (the Figma "% | AED" switch).

### Changed

- `@peopleforge/access` renamed to `@peopleforge/contracts`: it now carries the request and response schemas too.

### Added — design system (ADR-009)

- `packages/ui` (`@peopleforge/ui`): Figma tokens as a Tailwind theme, plus the components:
  - layout and content: Button/ButtonLink, Badge, Card, StatCard, PageHeader, Alert, Table, EmptyState;
  - inputs and navigation: Field/Input/Select/Textarea, ToggleGroup, Pagination;
  - progress and loading: ProgressSteps, Spinner, Skeleton;
  - identity: Avatar, Wordmark/BrandMark, NavItem, and an icon set.
    Every interactive part has a pointer cursor, hover/active states, 150 ms transitions and a keyboard focus ring; motion is reduced on request. Guide: `docs/design/design-system.md`.
- Portal restyled to the Figma: the dark sidebar has the PeopleForge wordmark, white active pill, initials avatar, and a sign-out icon with role and subsidiary. Page headers, cards, not-found, error and loading (skeleton) states use the design system.
- Shared ESLint rules for React workspaces (`eslint/react-rules.mjs`): i18n literals and physical-direction classes, now also inside variant tables.

### Added — slice S1 (ADR-002, ADR-008)

- `packages/db` (`@peopleforge/db`): plain-SQL migrations for schemas `core` (entities, user → entity assignments, increment cycles, interim employee directory) and `increments` (criteria sets and criteria), Row-Level Security (`ENABLE` + `FORCE`) on every entity-owned table, `withScope` for per-transaction scope, typed Kysely access, AES-256-GCM field encryption for salaries bound to table/column/row, and a synthetic dev/test seed (refused in UAT/Prod). One migration runner shared with the web app (`migrations.core`, `migrations.web`). Root scripts `pnpm db:migrate`, `pnpm db:seed`.
- Placeholder configuration (R1-05): "Increment cycle 2026" and a five-criterion set marked `[Placeholder]`, to be replaced when Sirius provides the criteria (A1).
- `packages/contracts` (`@peopleforge/contracts`, first named `access`): roles, permissions and the `/me` contract shared by the API and web, so both change together.
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
