# ADR-007: Shared `@sirius/*` packages from js-platform

- **Status:** Accepted for local development; the production registry is pending Sirius IT (A6, ADR-001)
- **Date:** 2026-10-12
- **Requirements:** NFR-SEC-01, NFR-CFG-01 (indirectly: one place to change shared behaviour)

## Context

Seven Sirius applications are planned, each in its own repository and some on different frameworks (DealForge is React + Vite with an Express server; PeopleForge is Next.js + NestJS). They share a lot: TypeScript, lint and test rules (including the 100% coverage gate), the API error shape, log redaction, spreadsheet formula-injection protection, and soon token verification, the access-policy guard and the sign-in screen.

If each repository keeps its own copy, a security fix has to be made seven times and copies drift apart.

## Decision

1. Shared code lives in one repository, **js-platform**, and is published as versioned packages under the `@sirius` scope. It starts with:
   - `@sirius/config` (tsconfig base, ESLint, Vitest, Prettier);
   - `@sirius/shared-types`;
   - `@sirius/utils`.
2. Apps consume **exact published versions** (`save-exact`), never source paths or git links. Upgrading is a deliberate version bump that runs the app's own test gate.
3. Packages are versioned with **Changesets** (SemVer; a major bump for breaking changes, with migration notes in the package CHANGELOG).
4. `@sirius/*` is served only by the **private registry**. Locally that is Verdaccio (`~/sirius/local-infra`), configured so `@sirius/*` is never proxied to the public npm registry (protection against dependency confusion), and reading requires authentication.
5. Registry credentials are never committed:
   - developers keep a token in their user-level `~/.npmrc`;
   - Docker builds receive it as a BuildKit secret;
   - CI receives it from its secret store.
6. **Only cross-app code goes into js-platform.** PeopleForge's roles, permission matrix and screens stay in PeopleForge.

## Alternatives considered

- **One monorepo for all apps:** rejected by the team. Apps have separate release cycles and frameworks, and DealForge already exists separately.
- **Git submodules or `git+ssh` dependencies:** no SemVer, poor lockfile integrity, and every consumer needs repository access.
- **Copying files between repositories:** the drift problem this ADR exists to stop.

## Consequences

- A change to shared code is a two-step flow: publish from js-platform, then bump in each app. Changesets and exact pins make that explicit and reviewable.
- Docker builds and CI depend on the registry being reachable. The production registry must be in-region and is part of the hosting decision (A6). The lockfile stores only integrity hashes, so the same lockfile works against Verdaccio locally and the approved registry later, provided the same tarballs are published there.
- `@sirius/config` sets the floor for code quality across apps: the coverage thresholds cannot be lowered per app.
