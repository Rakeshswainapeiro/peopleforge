import { defineConfig, devices } from '@playwright/test';
import { E2E, ISSUER, WEB_URL } from './e2e/support/env';

const API_URL = `http://localhost:${String(E2E.apiPort)}`;

// Runs against production builds (`next start`, the API's dist), so CSP, cookies and security
// headers are the real ones. NFR-BRW-01: latest Chrome, Edge and Safari, desktop and tablet.
// Identity comes from a local test OpenID provider: no Keycloak or Entra ID needed, and no
// real accounts. Needs PostgreSQL with the test database (README: "End-to-end tests").
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
  ],
  webServer: [
    {
      command: 'node e2e/support/oidc-provider.ts',
      url: `${ISSUER}/.well-known/openid-configuration`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'node ../api/dist/main.js',
      url: `${API_URL}/health/ready`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        APP_ENV: 'test',
        PORT: String(E2E.apiPort),
        LOG_LEVEL: 'warn',
        TRUST_PROXY_HOPS: '0',
        OIDC_ISSUER: ISSUER,
        OIDC_AUDIENCE: E2E.audience,
        OIDC_TENANT_ID: E2E.tenantId,
        OIDC_ALLOW_HTTP: 'true',
      },
    },
    {
      command: `pnpm exec next start --port ${String(E2E.webPort)}`,
      url: `${WEB_URL}/sign-in`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        APP_ENV: 'test',
        LOG_LEVEL: 'warn',
        NEXT_TELEMETRY_DISABLED: '1',
        AUTH_SECRET: 'e2e-only-auth-secret-0123456789abcdef',
        AUTH_URL: WEB_URL,
        OIDC_ISSUER: ISSUER,
        OIDC_TENANT_ID: E2E.tenantId,
        OIDC_ALLOW_HTTP: 'true',
        OIDC_CLIENT_ID: E2E.clientId,
        OIDC_CLIENT_SECRET: E2E.clientSecret,
        DATABASE_URL: E2E.databaseUrl,
        PEOPLEFORGE_API_URL: API_URL,
      },
    },
  ],
});
