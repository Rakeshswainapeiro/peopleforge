# ADR-003: Authentication — web session (BFF) and API access tokens

- **Status:** Proposed — implemented end to end locally (Keycloak), production identity provider Microsoft Entra ID pending Sirius IT app registrations (A6).
- **Date:** 2026-10-12
- **Requirements:** NFR-SEC-01, R1-01, R2-12

## Context

Every Sirius application signs people in with their Microsoft work account. PeopleForge has a Next.js web app and a separate NestJS API. We need:

- sign-in with MFA enforced by the identity provider (Entra Conditional Access);
- no tokens in browser JavaScript or storage;
- an API that trusts nothing but a token it can verify itself.

## Decision

1. **The web app is a backend-for-frontend (BFF).** It runs the OIDC authorization-code flow with PKCE as a confidential client (`peopleforge-web`) and keeps the session server-side. The browser holds only an HttpOnly, Secure, SameSite cookie. Better Auth will provide this (Step C, with shared settings in `@sirius/auth-better`).
2. **The API accepts only bearer access tokens issued for it** (audience `peopleforge-api`). The web server calls the API with the signed-in user's access token. The API never sees cookies and holds no identity secret.
3. **Verification happens on every request** (`@sirius/identity`):
   - RS256 only;
   - exact issuer;
   - audience must be this API, so ID tokens and tokens for other Sirius apps are refused;
   - the configured tenant (single-tenant);
   - expiry checked, with 30 s clock skew;
   - signing keys from the issuer's discovery document, which must name the same issuer and keep its keys on the issuer's origin.
4. **Claims follow Entra ID:** `oid` (stable user key), `tid`, `roles` (app roles), `preferred_username`, `name`. The local Keycloak realm maps its tokens to exactly these claims, so no code branches on the provider.
5. **Roles come from the identity provider; permissions from code.** App roles (`PeopleForge.Admin`, `.Reviewer`, `.Executive`, `.SubsidiaryHR`) are assigned in Entra. What each role may do is the reviewed matrix in `apps/api/src/auth/permissions.ts` (ADR-005).
6. **Failure handling:**
   - a bad, expired or foreign token gets 401, and only a reason code is logged;
   - an unreachable identity provider gets 503, so clients retry instead of signing the user out.
7. **Web sign-in details** (`@sirius/auth-better`, shared by all Sirius web apps):
   - organisation sign-in only, no passwords; authorization code + PKCE (S256); ID token verified against the provider's keys and nonce;
   - an account is created only for people whose access token carries a PeopleForge app role (data minimisation); others see "no access" and nothing is stored;
   - provider tokens are encrypted at rest; the session cookie is HttpOnly, SameSite=Lax, Secure outside development, prefixed per app;
   - sessions end 8 hours after sign-in; sign-out also ends the provider session (RP-initiated logout);
   - every sign-in outcome is logged as a structured event (IDs and reason codes only). The append-only audit table (NFR-AUD-01) receives these once the audit module exists.

## Alternatives considered

- **Browser holds tokens (SPA + public client):** tokens become reachable by XSS, and refresh tokens end up in the browser. Rejected.
- **The API validates the web session cookie:** couples the API to the web app's session store, and doesn't work for later service-to-service callers. Rejected.
- **Token introspection on every request:** adds a network round-trip and makes the identity provider a hard runtime dependency. Signature verification with cached keys gives the same guarantees for short-lived tokens.

## Consequences

- Access tokens are short-lived (Entra default about 60–90 minutes). Revocation takes effect at the next token refresh, not instantly. That is acceptable for Phase 1. If immediate revocation becomes a requirement, the API can additionally check a deny-list.
- Entity assignments for subsidiary users are not in the token. They come from the PeopleForge data model (ADR-002). Until that exists, subsidiary users are scoped to no entities.
- **Sirius IT needs to provide (A6):**
  - two app registrations: web as a confidential client, API exposing an Application ID URI with app roles;
  - assignment of users or groups to roles;
  - a Conditional Access policy requiring MFA.
