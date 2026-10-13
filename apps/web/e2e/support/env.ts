/**
 * End-to-end test environment. Everything runs locally: a test OpenID provider (stands in for
 * Entra ID / Keycloak), the API and the web app, against a separate test database — never
 * the development database.
 */
export const E2E = {
  webPort: 3100,
  apiPort: 4100,
  oidcPort: 18190,
  tenantId: '5a1f0c2e-7b3d-4e8a-9c21-5e7f0000c0de',
  clientId: 'peopleforge-web',
  clientSecret: 'e2e-only-client-secret',
  audience: 'peopleforge-api',
  databaseUrl:
    process.env.E2E_DATABASE_URL ??
    'postgres://peopleforge_app:local-pf-app-2026@localhost:55432/peopleforge_test',
  databaseOwnerUrl:
    process.env.E2E_DATABASE_OWNER_URL ??
    'postgres://peopleforge_owner:local-pf-owner-2026@localhost:55432/peopleforge_test',
} as const;

export const ISSUER = `http://127.0.0.1:${String(E2E.oidcPort)}/realms/sirius`;
export const WEB_URL = `http://localhost:${String(E2E.webPort)}`;
