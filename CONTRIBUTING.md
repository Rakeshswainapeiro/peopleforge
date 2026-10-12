# Contributing

## Workflow

1. Branch from `main`: `feat/<module>-<short-desc>`, `fix/…`, `chore/…`.
2. Commit with Conventional Commits and the BRD ID where relevant — enforced by commitlint:
   `feat(workflow): return request with clarification [R1-08]`
3. Pre-commit runs format check, lint and typecheck. CI runs everything else.
4. Open a PR; one reviewer approval required; CI must be green.

## Definition of Done

- [ ] Tests written in the same PR as the code; 100% lines/branches/functions/statements (CI enforces).
- [ ] Every new route has an explicit authorisation check plus tests for 401 and 403, and cross-entity access tests where data is entity-owned.
- [ ] Lint clean, typecheck clean, no new high/critical advisories.
- [ ] `docs/traceability.md` updated for any BRD requirement touched.
- [ ] Migrations come with `docs/database/` updates and a tested rollback.
- [ ] `DEPLOYMENT.md` updated for any new env var, service, port, migration or dependency.
- [ ] ADR added for significant decisions; `CHANGELOG.md` updated.

## Code rules (summary)

- TypeScript strict; no `any`, no unexplained non-null assertions.
- Layering: route → service → repository. No business logic in routes or UI components.
- Money/percentages: decimal library, never floats. Timestamps: UTC.
- Errors: throw `DomainError` subclasses; never send internal messages to clients.
- UI text: only via `t('key')` from `apps/web/messages/en.json` — lint rejects hardcoded JSX text.
- Layout: logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`) — lint rejects physical left/right utilities.
- `TODO` comments must reference a ticket: `TODO(SHR-123): …`.
- Coverage exclusions only for genuinely untestable files, each with a one-line justification in the Vitest config.
- Tests use synthetic data only. Never real employee data, never real third-party calls.
