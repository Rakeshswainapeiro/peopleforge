# ADR-005: NestJS for the API, and a deny-by-default access policy

- **Status:** Accepted (supersedes the API framework choice in ADR-001)
- **Date:** 2026-10-12
- **Requirements:** NFR-SEC-01, R1-01, R2-12

## Context

ADR-001 chose Express for the API. Since then the delivery team has standardised new Sirius applications on **Next.js + NestJS**: seven applications in total, each in its own repository, sharing contracts through `@sirius/*` packages. PeopleForge should follow the same stack so developers move between apps without relearning structure.

PeopleForge also needs very strong role-based access with entity isolation. Express gave us deny-by-default only at the router level. Per-route permission checks would have been hand-written and easy to forget.

## Decision

1. **NestJS 12** (ESM, Express 5 adapter) replaces plain Express. The existing security middleware is reused unchanged: request IDs, security headers, CORS allow-list, rate limiting, minimal request logging.
2. **Explicit injection tokens** (`@Inject(TOKEN)`) for every dependency. DI never relies on emitted type metadata, which type-only imports and some test transforms drop silently. `experimentalDecorators` is on; `emitDecoratorMetadata` is not needed.
3. **Every route declares one access policy**, via `@Public()` (health probes only), `@Authenticated()` or `@RequirePermission(...)`.
   - A **global `PolicyGuard`** refuses any route without a policy. Method-level policy overrides class-level.
   - **Start-up fails** (`MissingPolicyError`) if any controller route has no policy, so an unprotected route cannot ship by omission.
4. **Authentication runs before body parsing** for everything under `/api/v1`, including unknown paths. Anonymous callers get 401 and learn nothing about which routes exist.
5. **Code checks permissions, never role names.** Roles are the identity provider's app-role values (Entra app roles; Keycloak client roles locally). The role → permission matrix lives in code (`apps/api/src/auth/permissions.ts`), so changing what a role can do is a reviewed change.
6. **One error shape everywhere.** A global exception filter covers domain errors, validation, body-parser failures, Nest's own 404s and unexpected errors, with no internals leaked.

### Role → permission matrix (proposal, to confirm with Sirius HR in ADR-002)

| Permission                                                |   SubsidiaryHR   | Reviewer | Admin | Executive |
| --------------------------------------------------------- | :--------------: | :------: | :---: | :-------: |
| increment_request:create / submit                         |        ✓         |          |       |           |
| increment_request:review / decide                         |                  |    ✓     |       |           |
| evidence:upload                                           |        ✓         |          |       |           |
| employee_data:upload                                      |        ✓         |          |       |           |
| employee_data:read                                        | ✓ (own entities) |    ✓     |       |           |
| employee_data:read_compensation                           | ✓ (own entities) |    ✓     |       |           |
| employee_data:extract_raw                                 |                  |    ✓     |       |           |
| anomaly:resolve                                           |        ✓         |    ✓     |       |           |
| criteria:configure, template:configure, user_scope:manage |                  |          |   ✓   |           |
| report:read_operational                                   |        ✓         |    ✓     |   ✓   |           |
| report:read_executive                                     |                  |    ✓     |       |     ✓     |
| audit:read                                                |                  |    ✓     |   ✓   |           |

**Invariants enforced by tests:**

- **Separation of duties:** no role can both configure criteria and decide requests.
- Executives never see individual compensation.
- Only reviewers can extract raw data.
- Unknown role names grant nothing.

"Own entities" is enforced in the data layer (row-level security, ADR-002), not by this matrix.

## Alternatives considered

- **Stay on Express** with a hand-rolled policy registry: workable, but it diverges from the other Sirius apps and needs custom route introspection.
- **Global guard without the start-up audit:** the guard alone still denies unannotated routes at request time, but the audit turns a silent 403 into a failed deployment, which is caught far earlier.
- **Roles managed in an admin screen:** rejected for role _definitions_. Assignments come from Entra groups; data scopes (which entities) will live in the app database.

## Consequences

- Positive:
  - Same structure as the other NestJS apps.
  - Access rules are declarative and reviewed in one matrix test.
  - Forgetting a policy is impossible to deploy.
- Negative:
  - Decorators and a larger framework surface.
  - The NestJS major version must be tracked across all apps.
- Follow-ups:
  - Real `SessionResolver` (sign-in through Keycloak locally, Entra later).
  - Data-scope assignments and row-level security (ADR-002).
  - The policy guard moves into `@sirius/auth-nest` once a second NestJS app exists.
