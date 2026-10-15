/**
 * End-to-end test environment. Everything runs locally: a test OpenID provider (stands in for
 * Entra ID / Keycloak), the API and the web app, against a separate test database — never
 * the development database.
 */
export const E2E = {
  webPort: 3100,
  apiPort: 4100,
  oidcPort: 18190,
  /** The fake clamd (real protocol, flags EICAR) standing in for ClamAV. */
  clamavPort: 13310,
  /** Evidence files: the filesystem store, dev/test only (the API refuses it in UAT/prod). */
  evidenceDir: process.env.E2E_EVIDENCE_DIR ?? '/tmp/peopleforge-e2e-evidence',
  /** The email worker's probe port, and where it writes emails as .eml files (dev/test only). */
  workerPort: 4210,
  emailDir: process.env.E2E_EMAIL_DIR ?? '/tmp/peopleforge-e2e-mail',
  tenantId: '5a1f0c2e-7b3d-4e8a-9c21-5e7f0000c0de',
  clientId: 'peopleforge-web',
  clientSecret: 'e2e-only-client-secret',
  audience: 'peopleforge-api',
  databaseUrl:
    process.env.E2E_DATABASE_URL ??
    'postgres://peopleforge_app:local-pf-app-2026@localhost:55432/peopleforge_test',
  workerDatabaseUrl:
    process.env.E2E_DATABASE_WORKER_URL ??
    'postgres://peopleforge_worker:local-pf-worker-2026@localhost:55432/peopleforge_test',
  databaseOwnerUrl:
    process.env.E2E_DATABASE_OWNER_URL ??
    'postgres://peopleforge_owner:local-pf-owner-2026@localhost:55432/peopleforge_test',
  /**
   * Test-only salary key (ADR-008). The same synthetic key as packages/db's integration tests,
   * because both seed peopleforge_test and the seed never re-encrypts existing employees.
   */
  dataEncryptionKeys: `test-1:${Buffer.alloc(32, 7).toString('base64')}`,
  dataEncryptionActiveKey: 'test-1',
} as const;

export const ISSUER = `http://127.0.0.1:${String(E2E.oidcPort)}/realms/sirius`;
export const WEB_URL = `http://localhost:${String(E2E.webPort)}`;
